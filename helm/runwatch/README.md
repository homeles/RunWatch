# RunWatch Helm Chart

This chart deploys RunWatch to Kubernetes.

It creates:

- A backend Deployment and Service
- A frontend Deployment and Service
- An optional Ingress
- A ServiceAccount
- A Secret, unless you tell the chart to use an existing one

This chart does not deploy MongoDB. You must provide an external MongoDB connection string.

## Prerequisites

- A Kubernetes cluster
- Helm 3
- Container images for the RunWatch server and client that your cluster can pull
- An external MongoDB instance
- A GitHub App configured for the repositories you want RunWatch to monitor
- An ingress controller if you want public HTTP or HTTPS access

## Required Configuration

You must provide values for:

- `server.image.repository`
- `client.image.repository`
- `mongodb.uri`
- `github.webhookSecret`
- `github.appId`
- `github.appPrivateKey`
- `adminApiToken`
- `clientUrl`
- `reactAppApiUrl`
- `reactAppWebsocketUrl`

You can provide these either:

- Directly in Helm values, letting the chart create the Secret
- In an existing Kubernetes Secret referenced by `existingSecret`

## Secret Contents

If you use an existing Kubernetes Secret, it must contain these exact keys:

- `mongodb-uri`
- `github-webhook-secret`
- `github-app-id`
- `github-app-private-key`
- `admin-api-token`

The `github-app-private-key` value must be the raw PEM file content.

## Generate the Admin API Token

The admin API token is a RunWatch-specific shared secret used to protect the backup and restore API endpoints. It is not issued by GitHub or MongoDB.

Generate one with:

```bash
openssl rand -hex 32
```

## Option 1: Let Helm Create the Secret

Start from the example values file:

```bash
cp helm/runwatch/values-example.yaml my-values.yaml
```

Edit `my-values.yaml` and set your image names, hostnames, MongoDB URI, and GitHub App values.

Example:

```yaml
server:
  image:
    repository: ghcr.io/homeles/runwatch-server
    tag: latest

client:
  image:
    repository: ghcr.io/homeles/runwatch-client
    tag: latest

ingress:
  enabled: true
  className: nginx
  annotations:
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-http-version: "1.1"
  host: runwatch.example.com
  tls:
    - secretName: runwatch-tls
      hosts:
        - runwatch.example.com

mongodb:
  uri: "mongodb+srv://runwatch_app:YOUR_PASSWORD@your-cluster.mongodb.net/runwatch?retryWrites=true&w=majority"

github:
  webhookSecret: "your-webhook-secret"
  appId: "123456"
  appPrivateKey: ""

adminApiToken: "your-random-admin-token"

clientUrl: "https://runwatch.example.com"
reactAppApiUrl: "https://runwatch.example.com/api"
reactAppWebsocketUrl: "wss://runwatch.example.com"
```

Install the chart and load the PEM file from disk:

```bash
helm upgrade --install runwatch ./helm/runwatch \
  --namespace runwatch \
  --create-namespace \
  -f my-values.yaml \
  --set-file github.appPrivateKey=/absolute/path/to/private-key.pem
```

## Option 2: Use an Existing Kubernetes Secret

Create the namespace first:

```bash
kubectl create namespace runwatch
```

Create the secret:

```bash
kubectl create secret generic runwatch-secrets \
  --namespace runwatch \
  --from-literal=mongodb-uri="$MONGODB_URI" \
  --from-literal=github-webhook-secret="$GITHUB_WEBHOOK_SECRET" \
  --from-literal=github-app-id="$GITHUB_APP_ID" \
  --from-file=github-app-private-key="$GITHUB_APP_PRIVATE_KEY_PATH" \
  --from-literal=admin-api-token="$ADMIN_API_TOKEN"
```

Then create a values file like this:

```yaml
server:
  image:
    repository: ghcr.io/homeles/runwatch-server
    tag: latest

client:
  image:
    repository: ghcr.io/homeles/runwatch-client
    tag: latest

ingress:
  enabled: true
  className: nginx
  host: runwatch.example.com
  tls:
    - secretName: runwatch-tls
      hosts:
        - runwatch.example.com

existingSecret: runwatch-secrets

clientUrl: "https://runwatch.example.com"
reactAppApiUrl: "https://runwatch.example.com/api"
reactAppWebsocketUrl: "wss://runwatch.example.com"
```

Install the chart:

```bash
helm upgrade --install runwatch ./helm/runwatch \
  --namespace runwatch \
  -f my-values.yaml
```

## Private Registries

If your images are in a private registry, create an image pull secret and reference it in your values file:

```yaml
imagePullSecrets:
  - name: regcred
```

## Ingress Behavior

When ingress is enabled, the chart routes:

- `/api` to the backend service
- `/socket.io` to the backend service
- `/` to the frontend service

This means these values should normally match your public hostname:

- `clientUrl`: `https://runwatch.example.com`
- `reactAppApiUrl`: `https://runwatch.example.com/api`
- `reactAppWebsocketUrl`: `wss://runwatch.example.com`

## Validate Before Installing

You can render and lint the chart before installing:

```bash
helm lint ./helm/runwatch
helm template runwatch ./helm/runwatch -n runwatch -f my-values.yaml
```

## Verify the Deployment

Check the created resources:

```bash
kubectl get pods -n runwatch
kubectl get svc -n runwatch
kubectl get ingress -n runwatch
```

Check backend logs:

```bash
kubectl logs deploy/runwatch-server -n runwatch
```

If ingress is disabled, access the frontend with port forwarding:

```bash
kubectl port-forward svc/runwatch-client 8080:80 -n runwatch
```

Then open `http://localhost:8080`.

## GitHub App Webhook Configuration

After deployment, configure your GitHub App or repository webhook to send events to:

```text
https://runwatch.example.com/api/webhooks/github
```

Use the same value for the webhook secret in GitHub that you configured as `github.webhookSecret`.

RunWatch expects GitHub Actions-related webhook events and verifies the `X-Hub-Signature-256` signature using that shared secret.

If you don't have a valid SSL certificate use `http://runwatch.example.com/api/webhooks/github` instead, but be aware that this is less secure.

## Upgrade

To upgrade an existing release:

```bash
helm upgrade runwatch ./helm/runwatch \
  --namespace runwatch \
  -f my-values.yaml
```

If you are using Helm-managed secrets and need to update the private key file:

```bash
helm upgrade runwatch ./helm/runwatch \
  --namespace runwatch \
  -f my-values.yaml \
  --set-file github.appPrivateKey=/absolute/path/to/private-key.pem
```

## Uninstall

To remove the release:

```bash
helm uninstall runwatch -n runwatch
```

If you created the namespace only for RunWatch, you can remove it separately:

```bash
kubectl delete namespace runwatch
```