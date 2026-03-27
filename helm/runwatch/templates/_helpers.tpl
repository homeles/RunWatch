{{/*
Common labels
*/}}
{{- define "runwatch.labels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
{{- end }}

{{/*
Server labels
*/}}
{{- define "runwatch.server.labels" -}}
{{ include "runwatch.labels" . }}
app.kubernetes.io/component: server
{{- end }}

{{/*
Server selector labels
*/}}
{{- define "runwatch.server.selectorLabels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: server
{{- end }}

{{/*
Client labels
*/}}
{{- define "runwatch.client.labels" -}}
{{ include "runwatch.labels" . }}
app.kubernetes.io/component: client
{{- end }}

{{/*
Client selector labels
*/}}
{{- define "runwatch.client.selectorLabels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: client
{{- end }}

{{/*
Secret name
*/}}
{{- define "runwatch.secretName" -}}
{{- if .Values.existingSecret -}}
  {{- .Values.existingSecret -}}
{{- else -}}
  {{- printf "%s-%s" .Release.Name "runwatch" -}}
{{- end -}}
{{- end }}

{{/*
Service account name
*/}}
{{- define "runwatch.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
  {{- default (printf "%s-%s" .Release.Name "runwatch") .Values.serviceAccount.name -}}
{{- else -}}
  {{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end }}

{{/*
Full server service name (for internal DNS)
*/}}
{{- define "runwatch.server.fullname" -}}
{{- printf "%s-server" .Release.Name -}}
{{- end }}

{{/*
Full client service name
*/}}
{{- define "runwatch.client.fullname" -}}
{{- printf "%s-client" .Release.Name -}}
{{- end }}
