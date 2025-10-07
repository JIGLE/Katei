// Browser storage utilities for persisting data locally

export const storage = {
  // Get item from localStorage with JSON parsing
  get<T>(key: string, defaultValue: T): T {
    if (typeof window === 'undefined') return defaultValue;
    
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      console.error(`Error reading from localStorage: ${error}`);
      return defaultValue;
    }
  },

  // Set item in localStorage with JSON stringification
  set<T>(key: string, value: T): void {
    if (typeof window === 'undefined') return;
    
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Error writing to localStorage: ${error}`);
    }
  },

  // Remove item from localStorage
  remove(key: string): void {
    if (typeof window === 'undefined') return;
    
    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      console.error(`Error removing from localStorage: ${error}`);
    }
  },

  // Clear all items from localStorage
  clear(): void {
    if (typeof window === 'undefined') return;
    
    try {
      window.localStorage.clear();
    } catch (error) {
      console.error(`Error clearing localStorage: ${error}`);
    }
  }
};

// Storage keys used throughout the application
export const STORAGE_KEYS = {
  TASKS: 'paw_tasks',
  MEAL_PLAN: 'paw_meal_plan',
  RECIPES: 'paw_recipes',
  SETTINGS: 'paw_settings',
} as const;
