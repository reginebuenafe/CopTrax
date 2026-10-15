export function isProposalSubmissionMessage(message = "") {
  return /^(?:💰\s*)?Price proposal:\s*₱?[\d,.]+\/kg for [\d,.]+ tons\.?$/i.test(
    message.trim(),
  );
}

export function uniqueContractCardMessages(messages) {
  const seen = new Set();
  return messages.filter(message => {
    if (message.message_type !== "Contract Form" || !message.message_text?.startsWith("CONTRACT_CARD:")) {
      return true;
    }

    let card;
    try {
      card = JSON.parse(message.message_text.slice("CONTRACT_CARD:".length));
    } catch (error) {
      console.warn("Invalid contract chat card:", message.message_id, error);
      return true;
    }
    if (typeof card?.contract_id !== "string" || !card.contract_id) return true;
    const key = `${message.conversation_id ?? ""}:${card.contract_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function actionableProposalIndex(proposals, conversationStatus) {
  if (conversationStatus !== "Open" || proposals.length === 0) return -1;
  let latestIndex = 0;
  proposals.forEach((proposal, index) => {
    const latest = proposals[latestIndex];
    const timeDifference = new Date(proposal.submitted_at) - new Date(latest.submitted_at);
    if (timeDifference > 0 || (timeDifference === 0 && proposal.proposal_id > latest.proposal_id)) {
      latestIndex = index;
    }
  });
  return proposals[latestIndex].proposal_status === "Pending" ? latestIndex : -1;
}
