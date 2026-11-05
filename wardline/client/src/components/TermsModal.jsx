import Modal from "./Modal";

export default function TermsModal({ rulesText, onAccept, onDecline }) {
  return (
    <Modal title="Entry Rules" onClose={onDecline} width={520}>
      <div className="rules-doc">{rulesText}</div>
      <div className="flex gap-12 mt-24">
        <button className="btn btn-outline btn-block" onClick={onDecline}>Decline</button>
        <button className="btn btn-primary btn-block" onClick={onAccept}>Accept</button>
      </div>
    </Modal>
  );
}
