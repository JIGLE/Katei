# PAW - Personal Assistant Workspace

A mobile-first, lightweight fullstack life management application for managing tasks, calendar, and meal planning.

## Features

- 📅 **Dashboard**: Calendar integration and task management
- 🍽️ **Meal Planner**: Weekly meal planning with automated shopping lists
- 📖 **Recipe Manager**: Store and generate recipes with scoring system
- 📱 **Mobile-First Design**: Optimized for mobile devices with responsive UI
- 🐳 **Docker Ready**: Easy deployment on TrueNAS or any Docker host

## Tech Stack

- **Frontend/Backend**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Deployment**: Docker

## Getting Started

### Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

### Production Build

```bash
# Build the application
npm run build

# Start production server
npm start
```

### Docker Deployment

```bash
# Build Docker image
docker build -t paw:latest .

# Run container
docker run -p 3000:3000 paw:latest
```

## Project Structure

```
/app
  /dashboard       - Calendar and task management
  /meal-planner    - Meal planning module
  /api             - API routes
/components        - Reusable UI components
/lib               - Utility functions and helpers
/public            - Static assets
```

## License

Apache License 2.0 - See LICENSE file for details
