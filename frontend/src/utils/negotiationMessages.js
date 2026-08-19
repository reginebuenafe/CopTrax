export function isProposalSubmissionMessage(message = "") {
  return /^(?:💰\s*)?Price proposal:\s*₱?[\d,.]+\/kg for [\d,.]+ tons\.?$/i.test(
    message.trim(),
  );
}
