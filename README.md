# RunWatch - GitHub Actions Workflow Monitor

RunWatch is a real-time monitoring application for GitHub Actions workflows. It provides an interactive dashboard to track GitHub Action runs, including their status, execution time, and performance trends.

![](./docs/images/home-dashboard.png)

![](./docs/images/repo-dashboard.png)

## Features

- 🔄 Real-time monitoring of GitHub Actions workflow runs
- 📊 Dashboard displaying current and historical workflow runs
- 🔍 Detailed view of individual workflow runs and jobs
- 📈 Statistics and analytics on workflow performance
- 🔔 WebSocket-based real-time updates
- 🔒 Security hardened: rate limiting, CORS allowlist, helmet headers, MongoDB auth, admin token protection

## Tech Stack

### Backend
- Node.js & Express - API and webhook handling
- MongoDB with Mongoose - Data storage
- Socket.IO - Real-time communication
- @octokit/webhooks - GitHub webhook processing
- helmet - HTTP security headers
- express-rate-limit - Rate limiting

### Frontend
- React - UI framework
- Material UI - Component library
- React Router - Navigation
- Chart.js - Data visualization
- Socket.IO Client - Real-time updates

## Architecture

The application is structured as follows:

1. **GitHub Webhook Integration**: The backend receives webhook events from GitHub when workflow runs start, update, and complete.

2. **Data Processing Pipeline**: Incoming webhook data is processed, normalized, and stored in the database.

3. **Real-time Communication**: Updates are broadcast to connected clients via WebSockets.

4. **Dashboard UI**: The React frontend displays current and historical workflow data.

## Setup Instructions

### Prerequisites

- Node.js (v18+)
- MongoDB
- GitHub repository with Actions workflows
- Ability to configure GitHub webhooks

### Environment Configuration

1. Copy the example environment file:
   ```
   cp .env.example .env
   ```

2. Configure the following environment variables in `.env`:
   ```
   # Node environment
   NODE_ENV=production           # Use 'development' locally (enables localhost:3000 CORS origin)

   # Server Configuration
   PORT=5001                     # Port where the backend server will run
   # NOTE: dotenv does not expand variables — use a literal connection string here.
   # The app connects as MONGO_APP_USERNAME (least-privilege), not the root admin.
   MONGODB_URI=mongodb://runwatch_app:yourapppassword@mongodb:27017/runwatch?authSource=runwatch

   # MongoDB Root Credentials (used by docker-compose to initialise the DB)
   MONGO_ROOT_USERNAME=runwatch_admin
   MONGO_ROOT_PASSWORD=your_strong_root_password

   # MongoDB App Credentials (least-privilege user — used by the Node.js application)
   MONGO_APP_USERNAME=runwatch_app
   MONGO_APP_PASSWORD=your_strong_app_password

   # Admin API Token — protects /api/database/backup and /api/database/restore
   # Generate with: openssl rand -hex 32
   ADMIN_API_TOKEN=your_long_random_secret

   # GitHub Configuration
   GITHUB_WEBHOOK_SECRET=your_github_webhook_secret      # Generated webhook secret
   GITHUB_APP_ID=your_github_app_id                      # GitHub App ID
   GITHUB_APP_PRIVATE_KEY_PATH=./path/to/private-key.pem # Path to GitHub App private key

   # Client Configuration
   CLIENT_URL=http://localhost              # Base URL for the client application (trusted CORS origin)
   REACT_APP_API_URL=http://localhost/api   # API endpoint URL for the client
   REACT_APP_WEBSOCKET_URL=ws://localhost   # WebSocket URL for real-time updates
   ```

   > ⚠️ **Note:** `dotenv` does not perform variable substitution. `MONGODB_URI` must be a literal connection string — you cannot use `${MONGO_ROOT_USERNAME}` inside `.env`.

3. Generate a webhook secret:
   ```
   node scripts/generate-webhook-secret.js
   ```

4. Generate an admin API token:
   ```
   openssl rand -hex 32
   ```

5. Set up your GitHub App:
   - Create a GitHub App in your organization's settings
   - Define the below permissions for the App:
     - `Read` access to actions, metadata, and organization administration
     - `Read and write` access to workflows
   - Subscribe to the below events:
     - `Workflow Job`
     - `Workflow Run`
   - Note down the App ID
   - Generate and download the private key
   - Place the private key file in your project directory
   - Update the `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY_PATH` in your `.env` file

### Backend Setup

1. Navigate to the server directory:
   ```
   cd server
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Start the development server:
   ```
   npm run dev
   ```

### Frontend Setup

1. Navigate to the client directory:
   ```
   cd client
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Start the development server:
   ```
   npm start
   ```

### GitHub Webhook Configuration

1. In your GitHub repository, go to Settings > Webhooks > Add webhook

2. Configure the webhook:
   - Payload URL: `https://your-server-url/api/webhooks/github`
   - Content type: `application/json`
   - Secret: Use the same secret as in your `.env` file
   - Events: Select "Workflow runs" and "Workflow Jobs"

3. Save the webhook

## Usage

1. After setting up the application and configuring the webhooks, visit `http://localhost:3000` to access the dashboard.

2. When GitHub Actions workflows run in your repositories, you'll see real-time updates on the dashboard.

3. Click on individual workflow runs to view detailed information about the jobs and steps.

4. Check the Statistics page for insights on workflow performance and trends.

## Security

RunWatch ships with several security controls enabled by default:

| Control | Details |
|---|---|
| **HTTP security headers** | `helmet` middleware sets `X-Content-Type-Options`, `X-Frame-Options`, HSTS, CSP, and more |
| **CORS allowlist** | Only `CLIENT_URL` (and `localhost:3000` in development) are trusted; all other origins are rejected |
| **Rate limiting** | 100 req / 15 min globally per IP; 10 req / min on sync endpoints; GitHub webhook route is exempt |
| **MongoDB authentication** | Username + password required; port not exposed to the host network |
| **Admin token for backup/restore** | `/api/database/backup` and `/api/database/restore` require `Authorization: Bearer <ADMIN_API_TOKEN>` or `X-Admin-Token: <token>` |
| **Input validation** | Search queries are regex-escaped (ReDoS prevention); pagination values are clamped |
| **Body size limit** | Default 10 MB; `/api/database/restore` allows up to 100 MB |
| **Socket.IO CORS** | Same allowlist as Express CORS; server-to-server clients without `Origin` header are permitted |
| **Proxy awareness** | `trust proxy 1` configured so rate limiting and IP logging reflect real client IPs behind Nginx |

### Accessing Backup / Restore Endpoints

These endpoints are protected by a pre-shared admin token instead of IP restrictions (IP-based checks are unreliable behind Docker/Nginx):

```bash
# Backup
curl -H "Authorization: Bearer $ADMIN_API_TOKEN" http://localhost/api/database/backup

# Restore
curl -X POST \
  -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d @backup.json \
  http://localhost/api/database/restore
```

## Development

### Running Both Services

For development, you can run both the backend and frontend servers simultaneously:

1. In one terminal, start the backend server:
   ```
   cd server && npm run dev
   ```

2. In another terminal, start the frontend:
   ```
   cd client && npm start
   ```

> Set `NODE_ENV=development` in your `.env` to allow CORS from `http://localhost:3000` during local development.

## Deployment

### Docker Deployment

The application can be deployed using Docker and Docker Compose. This will create three containers:
- MongoDB database (auth enabled, not exposed to host)
- Node.js backend server
- Nginx serving the React frontend

#### Prerequisites
- Docker
- Docker Compose
- Git

#### Quick Start with Docker

1. Clone the repository:
   ```
   git clone <repository-url>
   cd RunWatch
   ```

2. Create a `.env` file in the root directory with all required variables (see [Environment Configuration](#environment-configuration) above). At minimum:
   ```
   NODE_ENV=production
   MONGO_ROOT_USERNAME=runwatch_admin
   MONGO_ROOT_PASSWORD=<strong root password>
   MONGO_APP_USERNAME=runwatch_app
   MONGO_APP_PASSWORD=<strong app password>
   MONGODB_URI=mongodb://runwatch_app:<app password>@mongodb:27017/runwatch?authSource=runwatch
   ADMIN_API_TOKEN=<openssl rand -hex 32>
   GITHUB_WEBHOOK_SECRET=<your webhook secret>
   GITHUB_APP_ID=<your app id>
   GITHUB_APP_PRIVATE_KEY_PATH=./path/to/private-key.pem
   CLIENT_URL=http://localhost
   REACT_APP_API_URL=http://localhost/api
   REACT_APP_WEBSOCKET_URL=ws://localhost
   ```

   > **docker-compose uses `${VAR:?msg}` syntax for MongoDB credentials** — it will refuse to start if `MONGO_ROOT_USERNAME` or `MONGO_ROOT_PASSWORD` are missing from your environment.

3. Use the deployment script to manage the application:
   ```bash
   # Start all services
   ./deploy.sh start

   # View logs
   ./deploy.sh logs

   # Stop all services
   ./deploy.sh stop

   # Rebuild services
   ./deploy.sh build

   # Check status
   ./deploy.sh status
   ```

4. Access the application:
   - Frontend: http://localhost
   - Backend API: http://localhost/api
   - WebSocket: ws://localhost/socket.io

#### Available Deploy Script Commands

- `./deploy.sh start` - Start all services
- `./deploy.sh stop` - Stop all services
- `./deploy.sh restart` - Restart all services
- `./deploy.sh logs` - Show logs from all services
- `./deploy.sh build` - Rebuild all services
- `./deploy.sh clean` - Remove all containers and volumes
- `./deploy.sh status` - Show status of all services

#### Container Management

The Docker setup includes:
- Automatic container restart on failure
- Volume persistence for MongoDB data
- Nginx reverse proxy configuration
- Network isolation between services (MongoDB not exposed to host)
- Health checks and dependency management
- MongoDB authentication enforced at startup

## Future Enhancements

- Authentication and multi-user support
- More advanced filtering and search capabilities
- Custom notifications for workflow failures
- Integration with other CI/CD platforms

## License

MIT
