# AI FAQ — Moisture Content Requirements

## STRICT TASK

Improve the **AI FAQ response for Moisture Content** in CopTrax.

When a user asks about **moisture content, MC limits, acceptable MC, MC deductions, rejection due to MC, or PCA moisture-content rules**, the AI Assistant must **NOT** return all of the information as one long paragraph.

Instead, display a **clean, responsive Moisture Content Table inside the AI chat response**.

---

## Required Moisture Content Table

| Moisture Content (MC) | Result | Deduction / Action |
|---|---|---|
| **Below 5.0 cc** | Accepted | No deduction |
| **5.0 cc – 20.2 cc** | Accepted | Apply the corresponding deduction based on the official PCA deduction table |
| **Above 20.2 cc** | Rejected | No payment |

---

## IMPORTANT LOGIC — DO NOT CHANGE

- **Below 5.0 cc** → Accepted, **no deduction**.
- **5.0 cc through 20.2 cc** → Accepted, but the appropriate **PCA deduction applies**.
- **Above 20.2 cc** → Automatically **rejected and receives no payment**.
- Do **NOT** simply state that “below 20.2 cc is acceptable” without explaining the different deduction ranges.
- Preserve the existing official PCA moisture-content and deduction data already implemented in the project.
- **DO NOT invent, modify, approximate, or hallucinate PCA deduction values.**

---

## UI REQUIREMENTS

1. Render the moisture-content information as an **actual styled table/component inside the AI Assistant response**.
2. Do **NOT** display raw Markdown table syntax to the user.
3. The table must fit naturally inside the existing AI Assistant chat bubble/card.
4. Keep the design consistent with the existing **CopTrax UI**.
5. Use clear column headings:
   - Moisture Content (MC)
   - Result
   - Deduction / Action
6. Visually distinguish **Accepted** and **Rejected** results without making the UI excessive or distracting.
7. The table must be **fully responsive on desktop and mobile**.
8. On small screens, prevent the table from breaking or overflowing the entire chat layout. Use responsive sizing or contained horizontal scrolling if necessary.
9. Do **NOT** create an unnecessarily large chat bubble with excessive empty space.
10. A short introductory sentence may appear before the table.
11. Do **NOT** repeat all of the table information again as a long paragraph below or above it.

---

## FAQ TRIGGER BEHAVIOR

The Moisture Content Table should be used for relevant questions such as:

- “What is the acceptable moisture content?”
- “What are the moisture content ranges?”
- “What happens if my MC is 10 cc?”
- “What MC gets rejected?”
- “Is there a moisture deduction?”
- “How does the PCA moisture deduction work?”
- “Show me the moisture content table.”

The implementation should also recognize reasonably similar wording instead of depending only on these exact sentences.

### Questions About a Specific MC Value

If the user asks about a **specific moisture-content value**, answer that specific question first.

Example:

> **User:** Is 10 cc accepted?
>
> **AI:** Yes. A moisture content of 10 cc is accepted, but a deduction applies based on the official PCA deduction table.

The table may then be shown as a supporting reference when appropriate.

---

## DATA INTEGRITY

The AI response must use the **existing official PCA moisture-content/deduction data in the project as the source of truth**.

Do not hard-code invented deduction percentages or values just to complete the table.

If a more detailed PCA deduction table already exists in the codebase, **reuse the existing data rather than creating a second conflicting version**.

---

## SCOPE RESTRICTION

**DO NOT modify unrelated functionality.**

Do not change:

- Negotiation logic
- Price negotiation rules
- Contract logic
- Delivery processing logic
- Payment logic
- Authentication
- Database schema unless absolutely required for this FAQ rendering change
- Other AI FAQ responses unless necessary to support the same response-rendering architecture
- Existing PCA values or business rules

Make **only the changes necessary** to improve the Moisture Content AI FAQ response and its presentation.

---

## IMPLEMENTATION REQUIREMENT

Before editing code:

1. Inspect the existing AI Assistant / FAQ implementation.
2. Locate where FAQ responses are generated and rendered.
3. Locate the existing PCA moisture-content/deduction data.
4. Reuse existing components/data where possible.
5. Implement the table without breaking normal text-based AI responses.

Do **NOT** replace working architecture unnecessarily.

---

## ACCEPTANCE CRITERIA

The task is complete only when:

- [ ] Moisture-content FAQ responses are no longer presented as one large paragraph.
- [ ] A proper Moisture Content Table renders inside the AI Assistant.
- [ ] Below 5.0 cc is shown as Accepted / No Deduction.
- [ ] 5.0–20.2 cc is shown as Accepted / PCA Deduction Applies.
- [ ] Above 20.2 cc is shown as Rejected / No Payment.
- [ ] Existing official PCA deduction data remains unchanged.
- [ ] Specific MC questions receive a direct answer.
- [ ] The table works correctly on desktop.
- [ ] The table works correctly on mobile.
- [ ] The chat layout does not overflow or become excessively large.
- [ ] Raw Markdown table characters are not displayed to end users.
- [ ] Unrelated CopTrax functionality remains unchanged.

**Follow every requirement in this file exactly. Do not skip, reinterpret, or silently remove requirements.**
