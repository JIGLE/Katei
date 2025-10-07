'use client';

import { useState } from 'react';
import Navigation from '@/components/Navigation';

interface Task {
  id: string;
  title: string;
  completed: boolean;
  dueDate?: string;
  priority: 'low' | 'medium' | 'high';
}

export default function Dashboard() {
  const [tasks, setTasks] = useState<Task[]>([
    { id: '1', title: 'Buy groceries', completed: false, dueDate: '2024-10-10', priority: 'high' },
    { id: '2', title: 'Finish project report', completed: false, dueDate: '2024-10-08', priority: 'medium' },
    { id: '3', title: 'Call dentist', completed: true, priority: 'low' },
  ]);
  const [newTask, setNewTask] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());

  const addTask = () => {
    if (newTask.trim()) {
      const task: Task = {
        id: Date.now().toString(),
        title: newTask,
        completed: false,
        priority: 'medium',
      };
      setTasks([...tasks, task]);
      setNewTask('');
    }
  };

  const toggleTask = (id: string) => {
    setTasks(tasks.map(task =>
      task.id === id ? { ...task, completed: !task.completed } : task
    ));
  };

  const deleteTask = (id: string) => {
    setTasks(tasks.filter(task => task.id !== id));
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'border-l-4 border-red-500';
      case 'medium': return 'border-l-4 border-yellow-500';
      case 'low': return 'border-l-4 border-green-500';
      default: return '';
    }
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    return days;
  };

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navigation />

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">
          Dashboard
        </h1>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Calendar Section */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Calendar
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1))}
                  className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  ←
                </button>
                <button
                  onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1))}
                  className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  →
                </button>
              </div>
            </div>

            <div className="text-center mb-4 text-gray-900 dark:text-white font-semibold">
              {monthNames[selectedDate.getMonth()]} {selectedDate.getFullYear()}
            </div>

            <div className="grid grid-cols-7 gap-1 mb-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="text-center text-sm font-medium text-gray-600 dark:text-gray-400 py-2">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {getDaysInMonth(selectedDate).map((day, index) => (
                <div
                  key={index}
                  className={`aspect-square flex items-center justify-center text-sm rounded ${
                    day
                      ? 'bg-gray-50 dark:bg-gray-700 hover:bg-blue-100 dark:hover:bg-blue-900 cursor-pointer text-gray-900 dark:text-white'
                      : ''
                  } ${
                    day === new Date().getDate() &&
                    selectedDate.getMonth() === new Date().getMonth() &&
                    selectedDate.getFullYear() === new Date().getFullYear()
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : ''
                  }`}
                >
                  {day}
                </div>
              ))}
            </div>
          </div>

          {/* Tasks Section */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              Tasks
            </h2>

            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addTask()}
                placeholder="Add a new task..."
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              />
              <button
                onClick={addTask}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                Add
              </button>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {tasks.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                  No tasks yet. Add one to get started!
                </p>
              ) : (
                tasks.map(task => (
                  <div
                    key={task.id}
                    className={`p-3 bg-gray-50 dark:bg-gray-700 rounded-lg ${getPriorityColor(task.priority)}`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={task.completed}
                        onChange={() => toggleTask(task.id)}
                        className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <span
                        className={`flex-1 ${
                          task.completed
                            ? 'line-through text-gray-500 dark:text-gray-400'
                            : 'text-gray-900 dark:text-white'
                        }`}
                      >
                        {task.title}
                      </span>
                      {task.dueDate && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {task.dueDate}
                        </span>
                      )}
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                <span>{tasks.filter(t => !t.completed).length} active</span>
                <span>{tasks.filter(t => t.completed).length} completed</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
