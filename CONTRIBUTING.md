# Contributing to PAW

Thank you for your interest in contributing to PAW (Personal Assistant Workspace)! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Making Changes](#making-changes)
- [Submitting Changes](#submitting-changes)
- [Code Style](#code-style)
- [Adding Features](#adding-features)

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork locally:
```bash
git clone https://github.com/YOUR_USERNAME/paw.git
cd paw
```

3. Add the upstream repository:
```bash
git remote add upstream https://github.com/JIGLE/paw.git
```

## Development Setup

1. Install Node.js 20 or later

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open http://localhost:3000 in your browser

## Project Structure

```
paw/
├── app/                    # Next.js App Router pages
│   ├── dashboard/          # Dashboard page (calendar & tasks)
│   ├── meal-planner/       # Meal planner page
│   ├── api/               # API routes (for future backend features)
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Home page
│   └── globals.css        # Global styles
├── components/            # Reusable React components
│   └── Navigation.tsx     # Navigation bar component
├── lib/                   # Utility functions and helpers
├── public/                # Static assets
├── Dockerfile             # Docker configuration
├── docker-compose.yml     # Docker Compose configuration
└── README.md             # Project documentation
```

## Making Changes

### Before You Start

1. Make sure you're working on the latest code:
```bash
git checkout main
git pull upstream main
```

2. Create a new branch for your feature/fix:
```bash
git checkout -b feature/your-feature-name
```

### Development Workflow

1. Make your changes in the appropriate files
2. Test your changes thoroughly:
```bash
npm run dev
```

3. Build the project to ensure no errors:
```bash
npm run build
```

4. Check for linting issues:
```bash
npm run lint
```

### Commit Guidelines

- Write clear, descriptive commit messages
- Use present tense ("Add feature" not "Added feature")
- Reference issues in commit messages when applicable

Example:
```
Add recipe filtering by category

- Implement category filter dropdown
- Update recipe display to respect filter
- Add tests for filter functionality

Fixes #123
```

## Submitting Changes

1. Push your changes to your fork:
```bash
git push origin feature/your-feature-name
```

2. Open a Pull Request on GitHub:
   - Provide a clear title and description
   - Reference any related issues
   - Include screenshots for UI changes
   - Ensure all checks pass

3. Wait for review:
   - Address any feedback from maintainers
   - Make requested changes in new commits
   - Push updates to the same branch

## Code Style

### TypeScript

- Use TypeScript for all new code
- Define proper types and interfaces
- Avoid using `any` type

### React Components

- Use functional components with hooks
- Keep components small and focused
- Extract reusable logic into custom hooks

### Naming Conventions

- Components: PascalCase (e.g., `MealPlanner.tsx`)
- Files: camelCase or kebab-case (e.g., `utils.ts`, `api-client.ts`)
- Variables/Functions: camelCase (e.g., `getUserData`)
- Constants: UPPER_SNAKE_CASE (e.g., `MAX_ITEMS`)

### Styling

- Use Tailwind CSS utility classes
- Follow mobile-first approach
- Ensure dark mode support
- Keep styles consistent with existing components

## Adding Features

### New Pages

1. Create a new directory in `app/`:
```bash
mkdir app/your-feature
```

2. Add a `page.tsx` file:
```tsx
export default function YourFeature() {
  return (
    <div>
      {/* Your component */}
    </div>
  );
}
```

3. Update navigation in `components/Navigation.tsx`

### New Components

1. Create component in `components/`:
```tsx
// components/YourComponent.tsx
export default function YourComponent() {
  return <div>{/* Component content */}</div>;
}
```

2. Import and use in pages:
```tsx
import YourComponent from '@/components/YourComponent';
```

### API Routes

1. Create API route in `app/api/`:
```tsx
// app/api/your-endpoint/route.ts
export async function GET() {
  return Response.json({ data: 'example' });
}
```

### Adding Dependencies

1. Install the dependency:
```bash
npm install package-name
```

2. Update documentation if the dependency affects deployment

## Testing

Currently, the project doesn't have automated tests. Contributions to add testing infrastructure are welcome!

Manual testing checklist:
- [ ] Feature works on desktop browsers
- [ ] Feature works on mobile devices
- [ ] Feature works in dark mode
- [ ] No console errors or warnings
- [ ] Build succeeds without errors
- [ ] Docker image builds successfully

## Documentation

When adding features:
1. Update README.md if needed
2. Add comments for complex logic
3. Update DEPLOYMENT.md for deployment-related changes
4. Include screenshots for UI changes

## Questions?

Feel free to:
- Open an issue for discussion
- Ask questions in pull request comments
- Reach out to maintainers

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.
