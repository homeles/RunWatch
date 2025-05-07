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

## Tech Stack

### Backend
- Node.js & Express - API and webhook handling
- MongoDB with Mongoose - Data storage
- Socket.IO - Real-time communication
- @octokit/webhooks - GitHub webhook processing

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

- Node.js (v14+)
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
   NODE_ENV=development          # Application environment (development/production)

   # Server Configuration
   PORT=5001                    # Port where the backend server will run
   MONGODB_URI=mongodb://mongodb:27017/runwatch  # MongoDB connection string

   # GitHub Configuration
   GITHUB_WEBHOOK_SECRET=your_github_webhook_secret      # Generated webhook secret
   GITHUB_APP_ID=your_github_app_id                     # GitHub App ID
   GITHUB_APP_PRIVATE_KEY_PATH=./path/to/private-key.pem  # Path to GitHub App private key

   # Client Configuration
   CLIENT_URL=http://localhost              # Base URL for the client application
   REACT_APP_API_URL=http://localhost/api   # API endpoint URL for the client
   REACT_APP_WEBSOCKET_URL=ws://localhost   # WebSocket URL for real-time updates
   ```

3. Generate a webhook secret:
   ```
   node scripts/generate-webhook-secret.js
   ```

4. Set up your GitHub App:
   - Create a GitHub App in your organization's settings
   - Note down the App ID
   - Generate and download the private key
   - Place the private key file in your project directory
   - Update the GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY_PATH in your .env file

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
   - Events: Select "Workflow runs" and any other events you want to track

3. Save the webhook

## Usage

1. After setting up the application and configuring the webhooks, visit `http://localhost:3000` to access the dashboard.

2. When GitHub Actions workflows run in your repositories, you'll see real-time updates on the dashboard.

3. Click on individual workflow runs to view detailed information about the jobs and steps.

4. Check the Statistics page for insights on workflow performance and trends.

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

## Deployment

### Docker Deployment

The application can be deployed using Docker and Docker Compose. This will create three containers:
- MongoDB database
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

2. Create a `.env` file in the root directory:
   ```
   # Node environment
   NODE_ENV=production

   # Server Configuration
   PORT=5001
   MONGODB_URI=mongodb://mongodb:27017/runwatch

   # GitHub Configuration
   GITHUB_WEBHOOK_SECRET=your_github_webhook_secret
   GITHUB_APP_ID=your_github_app_id
   GITHUB_APP_PRIVATE_KEY_PATH=./path/to/private-key.pem

   # Client Configuration
   CLIENT_URL=http://localhost
   REACT_APP_API_URL=http://localhost/api
   REACT_APP_WEBSOCKET_URL=ws://localhost
   ```

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
- Network isolation between services
- Health checks and dependency management

## Future Enhancements

- Authentication and multi-user support
- More advanced filtering and search capabilities
- Custom notifications for workflow failures
- Integration with other CI/CD platforms

## License

MIT
