import React, { useState } from "react";
import { List, ClipboardList, X, Activity, Copy, Check, ChevronLeft, ChevronRight } from "lucide-react";

interface ShoppingListOrRecipeSidebarProps {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  data: any;
}

export const ShoppingListOrRecipeSidebar: React.FC<ShoppingListOrRecipeSidebarProps> = ({
  isOpen,
  onOpen,
  onClose,
  data,
}) => {
  const [copied, setCopied] = useState(false);

  const isRecipe = data?.type === "recipe" || !!data?.ingredients || !!data?.instructions;
  const isNutrientTable = data?.type === "nutrient_table" || !!data?.rows;
  
  let title = "Nutrition Info";
  if (isRecipe) title = data?.title || "Recipe";
  else if (isNutrientTable) title = data?.food || "Nutrition Facts";
  else if (data) title = data?.title || "Shopping List";

  const handleCopyMarkdown = () => {
    if (!data) return;

    let markdown = `# ${title}\n\n`;

    if (isNutrientTable) {
      markdown += "| Nutrient | Amount |\n| :--- | :--- |\n";
      data.rows.forEach((row: any) => {
        markdown += `| ${row.nutrient} | ${row.amount} ${row.unit} |\n`;
      });
    } else if (isRecipe) {
      if (data.ingredients) {
        markdown += "### Ingredients\n\n";
        if (Array.isArray(data.ingredients)) {
          data.ingredients.forEach((ing: string) => markdown += `- ${ing}\n`);
        } else {
          markdown += `${data.ingredients}\n`;
        }
        markdown += "\n";
      }
      if (data.instructions) {
        markdown += "### Instructions\n\n";
        if (Array.isArray(data.instructions)) {
          data.instructions.forEach((step: string, i: number) => markdown += `${i + 1}. ${step}\n`);
        } else {
          markdown += `${data.instructions}\n`;
        }
      }
    } else if (data.items) {
      markdown += "### Items\n\n";
      data.items.forEach((item: any) => {
        const text = typeof item === 'string' ? item : `${item.amount || ''} ${item.name || ''}`;
        markdown += `- [ ] ${text.trim()}\n`;
      });
    }

    if (data.notes) {
      markdown += `\n> **Notes:** ${data.notes}\n`;
    }

    navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <aside
      className={`fixed right-0 top-20 z-20 flex h-[calc(100vh-5rem)] transition-transform duration-200 ${
        isOpen ? "translate-x-0" : "translate-x-full"
      }`}
    >
      {/* Pull Tab */}
      {data && (
        <button
          onClick={isOpen ? onClose : onOpen}
          className={`absolute left-0 top-1/2 -translate-x-full -translate-y-1/2 flex h-12 w-8 items-center justify-center rounded-l-xl ${
            isOpen ? "bg-white border-y border-l border-green-200" : "bg-green-600 text-white shadow-lg"
          } transition-colors hover:bg-green-700 hover:text-white`}
          title={isOpen ? "Close sidebar" : "Open sidebar"}
        >
          {isOpen ? <ChevronRight className="w-5 h-5 text-gray-500" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      )}

      <div className="w-80 border-l border-green-200 bg-white shadow-lg overflow-y-auto">
        {!data ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center text-gray-400">
            <ClipboardList className="w-12 h-12 mb-4 opacity-20" />
            <p className="text-sm">No info shared yet.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-green-100 px-4 py-3 sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2">
                {isRecipe ? <ClipboardList className="w-5 h-5 text-green-600" /> : isNutrientTable ? <Activity className="w-5 h-5 text-green-600" /> : <List className="w-5 h-5 text-green-600" />}
                <h2 className="text-sm font-semibold text-green-900 truncate max-w-[140px]">{title}</h2>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleCopyMarkdown}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-green-700 bg-green-50 hover:bg-green-100 rounded border border-green-200 transition-all"
                  title="Copy as Markdown"
                >
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied ? "Copied" : "Markdown"}
                </button>
                <button
                  onClick={onClose}
                  className="p-1 hover:bg-gray-100 rounded-full transition-colors underline decoration-green-500 decoration-2"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {isNutrientTable ? (
                <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-100 border-b border-gray-200">
                        <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">Nutrient</th>
                        <th className="px-3 py-2 text-right text-xs font-bold text-gray-600 uppercase">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {data.rows.map((row: any, i: number) => (
                        <tr key={i} className="hover:bg-white transition-colors">
                          <td className="px-3 py-2 text-gray-700 font-medium">{row.nutrient}</td>
                          <td className="px-3 py-2 text-right text-gray-900">
                            {row.amount} <span className="text-xs text-gray-500">{row.unit}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : isRecipe ? (
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
