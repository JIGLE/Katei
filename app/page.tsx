import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <header className="text-center mb-12 pt-8">
          <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-4">
            🐾 PAW
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300">
            Personal Assistant Workspace
          </p>
          <p className="text-md text-gray-500 dark:text-gray-400 mt-2">
            Your mobile-first life management companion
          </p>
        </header>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <Link href="/dashboard" className="block">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow cursor-pointer h-full">
              <div className="text-4xl mb-4">📅</div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Dashboard
              </h2>
              <p className="text-gray-600 dark:text-gray-300">
                Manage your tasks and view your calendar in one place. Stay organized
                and productive with an intuitive interface.
              </p>
              <div className="mt-4 text-blue-600 dark:text-blue-400 font-medium">
                Open Dashboard →
              </div>
            </div>
          </Link>

          <Link href="/meal-planner" className="block">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow cursor-pointer h-full">
              <div className="text-4xl mb-4">🍽️</div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Meal Planner
              </h2>
              <p className="text-gray-600 dark:text-gray-300">
                Plan your weekly meals, generate shopping lists, and discover new
                recipes with scoring and recommendations.
              </p>
              <div className="mt-4 text-blue-600 dark:text-blue-400 font-medium">
                Plan Meals →
              </div>
            </div>
          </Link>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-8">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
            ✨ Features
          </h3>
          <ul className="space-y-3 text-gray-600 dark:text-gray-300">
            <li className="flex items-start">
              <span className="mr-2">📱</span>
              <span><strong>Mobile-First Design:</strong> Optimized for smartphones and tablets</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">⚡</span>
              <span><strong>Lightweight & Fast:</strong> Built with modern web technologies</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">🔧</span>
              <span><strong>Modular Architecture:</strong> Easy to maintain and extend</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">🐳</span>
              <span><strong>Docker Ready:</strong> Simple deployment on TrueNAS or any server</span>
            </li>
          </ul>
        </div>

        <footer className="text-center text-gray-500 dark:text-gray-400 text-sm">
          <p>Built with Next.js, TypeScript, and Tailwind CSS</p>
          <p className="mt-2">Licensed under Apache 2.0</p>
        </footer>
      </div>
    </div>
  );
}
