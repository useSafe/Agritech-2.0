import React from 'react';
import { Button } from "@/components/ui/button";

/**
 * Reusable Confirmation Modal
 * 
 * @param {boolean} isOpen - Whether the modal is visible
 * @param {function} onClose - Function to call when closing/canceling
 * @param {function} onConfirm - Function to call when confirming
 * @param {string} title - Modal title
 * @param {string} message - Confirmation message
 * @param {string} confirmText - Text for confirm button (default: "Confirm")
 * @param {string} confirmVariant - Button variant for confirm (default: "destructive")
 */
const ConfirmModal = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title = "Confirm Action",
  message = "Are you sure you want to proceed?",
  confirmText = "Confirm",
  confirmVariant = "destructive"
}) => {
  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <>
      {/* Backdrop with flexbox centering */}
      <div 
        className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200"
        onClick={onClose}
      >
        {/* Modal - prevent backdrop click from closing when clicking modal */}
        <div 
          className="w-full max-w-md animate-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-card border border-border rounded-lg shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-border bg-muted/30">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <i className="fas fa-exclamation-triangle text-yellow-500"></i>
                {title}
              </h3>
            </div>

            {/* Content */}
            <div className="px-6 py-6">
              <p className="text-muted-foreground">
                {message}
              </p>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-muted/20 border-t border-border flex justify-end gap-3">
              <Button
                onClick={onClose}
                variant="outline"
                className="min-w-[100px]"
              >
                <i className="fas fa-times mr-2"></i>
                Cancel
              </Button>
              <Button
                onClick={handleConfirm}
                variant={confirmVariant}
                className={`min-w-[100px] ${confirmVariant === 'destructive' ? 'bg-red-600 hover:bg-red-700 text-white' : ''}`}
              >
                <i className="fas fa-check mr-2"></i>
                {confirmText}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ConfirmModal;
