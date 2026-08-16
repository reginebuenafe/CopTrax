function extractTerms(message) {
  const labelled = message.match(
    /Price:\s*₱?([\d,.]+)\/kg\s+Volume:\s*([\d,.]+)\s*tons/i,
  );
  if (labelled) return { price: labelled[1], volume: labelled[2] };

  const inline = message.match(
    /₱?([\d,.]+)\/kg\s+for\s+([\d,.]+)\s*tons/i,
  );
  return inline ? { price: inline[1], volume: inline[2] } : null;
}

function termsLine(terms) {
  return terms ? `\nPrice: ₱${terms.price}/kg Volume: ${terms.volume} tons` : "";
}

function proposalDecisionText(action, viewer, terms) {
  const subject = viewer === "supplier" ? "NERC Copra Trading" : "You";
  const object = viewer === "supplier" ? "your proposal" : "the proposal";
  const termsText = terms ? ` of ₱${terms.price}/kg for ${terms.volume} tons` : "";
  return `${subject} ${action} ${object}${termsText}.`;
}

export function isProposalSubmissionMessage(message = "") {
  return /^(?:💰\s*Price proposal|🔄\s*Counteroffer):/i.test(message.trim());
}

/**
 * Converts persisted negotiation action messages into perspective-correct
 * system text for the full BO and Supplier chat layouts. Handles legacy Text
 * rows as well as newer Contract Form rows.
 */
export function getNegotiationSystemMessage({ message = "", viewer, isMine, supplierName = "Supplier" }) {
  const raw = message.trim();
  const terms = extractTerms(raw);

  if (/^Proposal accepted:/i.test(raw)) {
    return {
      tone: "accepted",
      text: proposalDecisionText("accepted", viewer, terms),
    };
  }

  if (/^Proposal rejected:/i.test(raw)) {
    return {
      tone: "rejected",
      text: proposalDecisionText("rejected", viewer, terms),
    };
  }

  if (/^Counteroffer accepted:/i.test(raw)) {
    const termsText = terms ? ` of ₱${terms.price}/kg for ${terms.volume} tons` : "";
    return {
      tone: "accepted",
      text: viewer === "supplier"
        ? `You accepted NERC Copra Trading's counteroffer${termsText}.`
        : `The Supplier accepted your counteroffer${termsText}.`,
    };
  }

  if (/^Counteroffer rejected:/i.test(raw)) {
    const termsText = terms ? ` of ₱${terms.price}/kg for ${terms.volume} tons` : "";
    return {
      tone: "rejected",
      text: viewer === "supplier"
        ? `You rejected NERC Copra Trading's counteroffer${termsText}.`
        : `The Supplier rejected your counteroffer${termsText}.`,
    };
  }

  if (/^(?:You|NERC) accepted .+proposal form\./i.test(raw)) {
    return {
      tone: "accepted",
      text: proposalDecisionText("accepted", viewer, terms),
    };
  }

  if (/^❌\s*Proposal declined:/i.test(raw) || /^NERC rejected your proposal form\./i.test(raw)) {
    return {
      tone: "rejected",
      text: proposalDecisionText("rejected", viewer, terms),
    };
  }

  if (/^🔄\s*Counteroffer:/i.test(raw)) {
    const text = viewer === "supplier"
      ? isMine ? "You sent NERC a counteroffer." : "NERC sent you a counteroffer."
      : isMine ? `You sent ${supplierName} a counteroffer.` : `${supplierName} sent you a counteroffer.`;
    return { tone: "counteroffer", text: `${text}${termsLine(terms)}` };
  }

  if (/^✅\s*Counteroffer accepted:/i.test(raw)) {
    const termsText = terms ? ` of ₱${terms.price}/kg for ${terms.volume} tons` : "";
    return {
      tone: "accepted",
      text: viewer === "supplier"
        ? `You accepted NERC Copra Trading's counteroffer${termsText}.`
        : `The Supplier accepted your counteroffer${termsText}.`,
    };
  }

  if (/^❌\s*Counteroffer declined\.?$/i.test(raw)) {
    return {
      tone: "rejected",
      text: viewer === "supplier"
        ? "You rejected NERC Copra Trading's counteroffer."
        : "The Supplier rejected your counteroffer.",
    };
  }

  return null;
}

export function negotiationToneClass(tone) {
  if (tone === "rejected") return "text-red-600";
  if (tone === "counteroffer") return "text-blue-600";
  return "text-[#17682D]";
}
