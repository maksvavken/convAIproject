import React from "react";
import { List, ClipboardList, X } from "lucide-react";

interface ShoppingListOrRecipeSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  data: any;
}

export const ShoppingListOrRecipeSidebar: React.FC<ShoppingListOrRecipeSidebarProps> = ({
  isOpen,
  onClose,
  data,
}) => {
  const isRecipe = data?.type === "recipe" || !!data?.ingredients || !!data?.instructions;
  const title = data?.title || (isRecipe ? "Recipe" : "Shopping List");

  return (
    <aside
      className={`fixed right-0 top-20 z-20 flex h-[calc(100vh-5rem)] transition-transform duration-200 ${
        isOpen ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div className="w-80 border-l border-green-200 bg-white shadow-lg overflow-y-auto">
        {!data ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center text-gray-400">
            <ClipboardList className="w-12 h-12 mb-4 opacity-20" />
            <p className="text-sm">No recipe or shopping list shared yet.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-green-100 px-4 py-3 sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2">
                {isRecipe ? <ClipboardList className="w-5 h-5 text-green-600" /> : <List className="w-5 h-5 text-green-600" />}
                <h2 className="text-sm font-semibold text-green-900">{title}</h2>
              </div>
              <button
                onClick={onClose}
                className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {isRecipe ? (
                <>
                  {data.ingredients && (
                    <div>
                      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Ingredients</h3>
                      <ul className="space-y-1">
                        {Array.isArray(data.ingredients) ? data.ingredients.map((item: string, i: number) => (
                          <li key={i} className="text-sm text-gray-700 flex gap-2">
                            <span className="text-green-500">•</span>
                            {item}
                          </li>
                        )) : <li className="text-sm text-gray-700">{data.ingredients}</li>}
                      </ul>
                    </div>
                  )}
                  {data.instructions && (
                    <div>
                      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Instructions</h3>
                      <div className="space-y-2">
                        {Array.isArray(data.instructions) ? data.instructions.map((step: string, i: number) => (
                          <div key={i} className="text-sm text-gray-700 flex gap-2">
                            <span className="font-bold text-green-600">{i + 1}.</span>
                            {step}
                          </div>
                        )) : <p className="text-sm text-gray-700 whitespace-pre-wrap">{data.instructions}</p>}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Items</h3>
                  <ul className="space-y-2">
                    {Array.isArray(data.items) ? data.items.map((item: any, i: number) => (
                      <li key={i} className="flex items-start gap-2 p-2 rounded bg-gray-50 border border-gray-100">
                        <input type="checkbox" className="mt-1 rounded border-gray-300 text-green-600 focus:ring-green-500" />
                        <span className="text-sm text-gray-700">
                          {typeof item === 'string' ? item : `${item.amount || ''} ${item.name || ''}`}
                        </span>
                      </li>
                    )) : null}
                  </ul>
                </div>
              )}
              
              {data.notes && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <h4 className="text-xs font-bold text-blue-800 uppercase mb-1">Notes</h4>
                  <p className="text-xs text-blue-700">{data.notes}</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  );
};
