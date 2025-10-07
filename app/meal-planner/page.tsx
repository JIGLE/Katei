'use client';

import { useState } from 'react';
import Navigation from '@/components/Navigation';

interface Recipe {
  id: string;
  name: string;
  ingredients: string[];
  instructions: string;
  score: number;
  prepTime: number;
  servings: number;
  category: 'breakfast' | 'lunch' | 'dinner' | 'snack';
}

interface MealPlan {
  [key: string]: {
    breakfast?: Recipe;
    lunch?: Recipe;
    dinner?: Recipe;
  };
}

const sampleRecipes: Recipe[] = [
  {
    id: '1',
    name: 'Avocado Toast',
    ingredients: ['2 slices whole grain bread', '1 avocado', 'Salt', 'Pepper', 'Red pepper flakes'],
    instructions: 'Toast bread, mash avocado, spread on toast, season to taste.',
    score: 8.5,
    prepTime: 10,
    servings: 1,
    category: 'breakfast',
  },
  {
    id: '2',
    name: 'Greek Salad',
    ingredients: ['2 tomatoes', '1 cucumber', '1/2 red onion', 'Feta cheese', 'Olives', 'Olive oil', 'Lemon juice'],
    instructions: 'Chop vegetables, add feta and olives, drizzle with olive oil and lemon juice.',
    score: 9.0,
    prepTime: 15,
    servings: 2,
    category: 'lunch',
  },
  {
    id: '3',
    name: 'Chicken Stir Fry',
    ingredients: ['2 chicken breasts', 'Mixed vegetables', 'Soy sauce', 'Garlic', 'Ginger', 'Rice'],
    instructions: 'Cook chicken, add vegetables and sauce, serve over rice.',
    score: 8.8,
    prepTime: 30,
    servings: 4,
    category: 'dinner',
  },
  {
    id: '4',
    name: 'Oatmeal Bowl',
    ingredients: ['1 cup oats', '2 cups milk', 'Banana', 'Berries', 'Honey', 'Nuts'],
    instructions: 'Cook oats with milk, top with fruits, honey, and nuts.',
    score: 8.0,
    prepTime: 10,
    servings: 1,
    category: 'breakfast',
  },
  {
    id: '5',
    name: 'Pasta Primavera',
    ingredients: ['Pasta', 'Bell peppers', 'Zucchini', 'Cherry tomatoes', 'Garlic', 'Olive oil', 'Parmesan'],
    instructions: 'Cook pasta, sauté vegetables, combine and top with parmesan.',
    score: 8.7,
    prepTime: 25,
    servings: 4,
    category: 'dinner',
  },
];

export default function MealPlanner() {
  const [mealPlan, setMealPlan] = useState<MealPlan>({});
  const [selectedDay, setSelectedDay] = useState<string>('Monday');
  const [showRecipes, setShowRecipes] = useState(false);
  const [selectedMealType, setSelectedMealType] = useState<'breakfast' | 'lunch' | 'dinner'>('breakfast');
  const [recipes] = useState<Recipe[]>(sampleRecipes);

  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const addMealToPlan = (recipe: Recipe) => {
    setMealPlan({
      ...mealPlan,
      [selectedDay]: {
        ...mealPlan[selectedDay],
        [selectedMealType]: recipe,
      },
    });
    setShowRecipes(false);
  };

  const removeMealFromPlan = (day: string, mealType: 'breakfast' | 'lunch' | 'dinner') => {
    const updatedDay = { ...mealPlan[day] };
    delete updatedDay[mealType];
    setMealPlan({
      ...mealPlan,
      [day]: updatedDay,
    });
  };

  const generateShoppingList = () => {
    const ingredients = new Set<string>();
    Object.values(mealPlan).forEach(day => {
      [day.breakfast, day.lunch, day.dinner].forEach(meal => {
        if (meal) {
          meal.ingredients.forEach(ingredient => ingredients.add(ingredient));
        }
      });
    });
    return Array.from(ingredients);
  };

  const shoppingList = generateShoppingList();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navigation />

      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">
          Meal Planner
        </h1>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Weekly Meal Plan */}
          <div className="lg:col-span-2 space-y-4">
            {daysOfWeek.map(day => (
              <div key={day} className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">
                  {day}
                </h3>

                <div className="space-y-2">
                  {(['breakfast', 'lunch', 'dinner'] as const).map(mealType => {
                    const meal = mealPlan[day]?.[mealType as keyof typeof mealPlan[typeof day]];
                    return (
                      <div key={mealType} className="flex items-center gap-3">
                        <div className="w-24 text-sm text-gray-600 dark:text-gray-400 capitalize">
                          {mealType}:
                        </div>
                        {meal ? (
                          <div className="flex-1 flex items-center justify-between bg-blue-50 dark:bg-blue-900/30 p-2 rounded">
                            <div>
                              <span className="text-gray-900 dark:text-white font-medium">
                                {meal.name}
                              </span>
                              <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">
                                ⭐ {meal.score}/10
                              </span>
                            </div>
                            <button
                              onClick={() => removeMealFromPlan(day, mealType)}
                              className="text-red-600 hover:text-red-700 dark:text-red-400"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setSelectedDay(day);
                              setSelectedMealType(mealType);
                              setShowRecipes(true);
                            }}
                            className="flex-1 p-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded text-gray-500 dark:text-gray-400 hover:border-blue-500 hover:text-blue-600 transition-colors"
                          >
                            + Add meal
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Shopping List */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                Shopping List
              </h2>
              {shoppingList.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                  Add meals to generate a shopping list
                </p>
              ) : (
                <ul className="space-y-2">
                  {shoppingList.map((ingredient, index) => (
                    <li
                      key={index}
                      className="flex items-center gap-2 text-gray-700 dark:text-gray-300"
                    >
                      <input
                        type="checkbox"
                        className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      {ingredient}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">
                Quick Stats
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-gray-600 dark:text-gray-400">
                  <span>Planned Meals:</span>
                  <span className="font-semibold">
                    {Object.values(mealPlan).reduce(
                      (acc, day) => acc + Object.keys(day).length,
                      0
                    )}
                  </span>
                </div>
                <div className="flex justify-between text-gray-600 dark:text-gray-400">
                  <span>Shopping Items:</span>
                  <span className="font-semibold">{shoppingList.length}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recipe Selection Modal */}
      {showRecipes && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Select {selectedMealType} for {selectedDay}
                </h2>
                <button
                  onClick={() => setShowRecipes(false)}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                {recipes
                  .filter(recipe => recipe.category === selectedMealType)
                  .map(recipe => (
                    <div
                      key={recipe.id}
                      className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-blue-500 transition-colors cursor-pointer"
                      onClick={() => addMealToPlan(recipe)}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                          {recipe.name}
                        </h3>
                        <div className="text-yellow-500 font-bold">
                          ⭐ {recipe.score}/10
                        </div>
                      </div>
                      <div className="flex gap-4 text-sm text-gray-600 dark:text-gray-400 mb-3">
                        <span>⏱️ {recipe.prepTime} min</span>
                        <span>👥 {recipe.servings} servings</span>
                      </div>
                      <div className="mb-2">
                        <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Ingredients:
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {recipe.ingredients.join(', ')}
                        </p>
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Instructions:
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {recipe.instructions}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
