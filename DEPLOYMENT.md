# Deployment Guide

This guide covers different deployment options for PAW (Personal Assistant Workspace).

## Table of Contents

- [Docker Deployment](#docker-deployment)
- [TrueNAS Deployment](#truenas-deployment)
- [Traditional Deployment](#traditional-deployment)
- [Environment Variables](#environment-variables)

## Docker Deployment

### Using Docker Compose (Recommended)

1. Clone the repository:
```bash
git clone https://github.com/JIGLE/paw.git
cd paw
```

2. Build and start the container:
```bash
docker-compose up -d
```

3. Access the application at `http://localhost:3000`

### Using Docker CLI

1. Build the image:
```bash
docker build -t paw:latest .
```

2. Run the container:
```bash
docker run -d \
  --name paw-app \
  -p 3000:3000 \
  --restart unless-stopped \
  paw:latest
```

## TrueNAS Deployment

### Option 1: Docker App (Recommended)

1. In TrueNAS, go to **Apps** → **Available Applications**
2. Click **Launch Docker Image**
3. Configure the following:
   - **Application Name**: paw
   - **Image Repository**: Build your image and push to a registry, or use the Dockerfile
   - **Port**: 3000 (container) → 3000 (host)
   - **Restart Policy**: Unless Stopped
   
4. Click **Save** and wait for deployment

### Option 2: Custom App

1. Build the Docker image on your local machine:
```bash
docker build -t paw:latest .
docker save paw:latest | gzip > paw-image.tar.gz
```

2. Transfer the image to your TrueNAS server

3. Load the image:
```bash
docker load < paw-image.tar.gz
```

4. Deploy using Docker Compose or CLI as shown above

### Accessing on TrueNAS

Once deployed, access PAW at:
- `http://<truenas-ip>:3000`

For external access, configure your router to forward port 3000 to your TrueNAS server.

## Traditional Deployment

### Requirements

- Node.js 20 or later
- npm or yarn

### Steps

1. Install dependencies:
```bash
npm install
```

2. Build the application:
```bash
npm run build
```

3. Start the production server:
```bash
npm start
```

4. The application will be available at `http://localhost:3000`

### Using PM2 for Process Management

1. Install PM2 globally:
```bash
npm install -g pm2
```

2. Start the application:
```bash
pm2 start npm --name paw -- start
```

3. Configure PM2 to start on boot:
```bash
pm2 startup
pm2 save
```

## Environment Variables

Create a `.env.local` file in the project root to configure environment variables:

```env
# Server Configuration
PORT=3000
NODE_ENV=production

# Add any future API keys or configuration here
```

## Production Considerations

### Security

- Always use HTTPS in production (configure a reverse proxy like Nginx or Traefik)
- Keep your Docker images updated
- Use environment variables for sensitive configuration

### Performance

- The application uses Next.js static optimization where possible
- Docker image uses multi-stage builds for optimal size
- Consider adding a CDN for static assets in high-traffic scenarios

### Backup

Since the current version stores data in browser local storage, no server-side backup is needed. Future versions with database integration should include backup procedures.

## Troubleshooting

### Container won't start

1. Check logs:
```bash
docker logs paw-app
```

2. Ensure port 3000 is not in use:
```bash
lsof -i :3000
```

### Application is slow

1. Check container resources:
```bash
docker stats paw-app
```

2. Increase container memory/CPU limits if needed

### Cannot access from other devices

1. Ensure firewall allows port 3000
2. Check that the container is binding to 0.0.0.0, not 127.0.0.1
3. Verify network settings in Docker configuration

## Updating

### Docker Deployment

1. Pull the latest changes:
```bash
git pull
```

2. Rebuild and restart:
```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Traditional Deployment

1. Pull the latest changes:
```bash
git pull
```

2. Reinstall dependencies and rebuild:
```bash
npm install
npm run build
pm2 restart paw
```

## Support

For issues and questions, please open an issue on the GitHub repository.
