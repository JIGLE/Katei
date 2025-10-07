// Shared type definitions for the application

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  dueDate?: string;
  priority: 'low' | 'medium' | 'high';
  createdAt: string;
}

export interface Recipe {
  id: string;
  name: string;
  ingredients: string[];
  instructions: string;
  score: number;
  prepTime: number;
  servings: number;
  category: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  tags?: string[];
}

export interface MealPlan {
  [day: string]: {
    breakfast?: Recipe;
    lunch?: Recipe;
    dinner?: Recipe;
  };
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  type: 'task' | 'meal' | 'event';
}
