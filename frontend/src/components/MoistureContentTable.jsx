import { LuDroplets, LuCircleCheck, LuCircleX } from "react-icons/lu";
import { formatMessageText } from "../utils/formatMessageText";

/**
 * MoistureContentTable — renders the AI FAQ assistant's moisture-content
 * answer as the COMPLETE official PCA deduction table instead of one long
 * paragraph or a 3-row summary.
 *
 * Rendered whenever a chat message's text starts with "MC_TABLE:" (see
 * ai-faq/index.ts, which builds this payload deterministically from the
 * real `pca_discount_table` — never invented/approximated values).
 *
 * Props:
 *   intro     – short lead-in sentence (string)
 *   specific  – { mc, result: "Accepted" | "Rejected", discount: number|null }
 *               or null when the question didn't include a specific MC value.
 *   fullTable – [{ mc: number, discount: number }, ...] every row of
 *               pca_discount_table (5.0cc–20.2cc, 0.1cc increments), sorted
 *               ascending. Rendered row-by-row — never collapsed into ranges.
 */
export default function MoistureContentTable({ intro, specific, fullTable }) {
  const rows = Array.isArray(fullTable) ? fullTable : [];

  return (
    <div className="max-w-full sm:max-w-[460px] space-y-2">
      {intro && (
        <p className="text-sm leading-relaxed">{formatMessageText(intro)}</p>
      )}

      {specific && (
        <div
          className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${
            specific.result === "Rejected"
              ? "bg-red-50 text-red-700"
              : "bg-green-50 text-green-700"
          }`}
        >
          {specific.result === "Rejected"
            ? <LuCircleX className="h-4 w-4 shrink-0" />
            : <LuCircleCheck className="h-4 w-4 shrink-0" />}
          <span>
            {specific.mc}cc &rarr; {specific.result}
            {specific.result === "Accepted" && specific.discount != null && (
              specific.discount > 0
                ? ` (${specific.discount}% deduction applied)`
                : " (no deduction)"
            )}
          </span>
        </div>
      )}

      {/* Complete PCA table: every MC row, no ranges collapsed. Vertical
          scroll keeps the chat bubble from growing unbounded; horizontal
          scroll (via overflow-x-auto) covers narrow mobile widths. */}
      <div className="overflow-x-auto rounded-xl border border-[#e8e0d0]">
        <div className="max-h-72 min-w-[300px] overflow-y-auto">
          <table className="w-full min-w-[300px] border-collapse text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#f5f0e8] text-[#5c4a32]">
                <th className="whitespace-nowrap px-2.5 py-2 text-left font-bold">
                  <span className="inline-flex items-center gap-1"><LuDroplets className="h-3.5 w-3.5" /> MC</span>
                </th>
                <th className="whitespace-nowrap px-2.5 py-2 text-left font-bold">Deduction</th>
                <th className="px-2.5 py-2 text-left font-bold">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8e0d0] bg-white">
              <tr>
                <td className="whitespace-nowrap px-2.5 py-2 text-[#3d2b1f]">Below 5.0cc</td>
                <td className="px-2.5 py-2 text-[#5c4a32]">No deduction</td>
                <td className="px-2.5 py-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 font-semibold text-green-700">
                    Accepted
                  </span>
                </td>
              </tr>

              {rows.map((row) => (
                <tr key={row.mc}>
                  <td className="whitespace-nowrap px-2.5 py-2 text-[#3d2b1f]">{row.mc.toFixed(1)}cc</td>
                  <td className="px-2.5 py-2 text-[#5c4a32]">{row.discount}%</td>
                  <td className="px-2.5 py-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 font-semibold text-green-700">
                      Accepted
                    </span>
                  </td>
                </tr>
              ))}

              <tr>
                <td className="whitespace-nowrap px-2.5 py-2 text-[#3d2b1f]">Above 20.2cc</td>
                <td className="px-2.5 py-2 text-[#5c4a32]">&mdash;</td>
                <td className="px-2.5 py-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 font-semibold text-red-600">
                    Rejected
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
