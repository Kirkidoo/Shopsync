import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { MismatchDetail } from '@/lib/types';

interface FixMismatchesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (types: MismatchDetail['field'][]) => void;
  availableTypes: Set<MismatchDetail['field']>;
}

export const FixMismatchesDialog = ({
  isOpen,
  onClose,
  onConfirm,
  availableTypes,
}: FixMismatchesDialogProps) => {
  const [selectedTypes, setSelectedTypes] = useState<Set<MismatchDetail['field']>>(new Set());

  useEffect(() => {
    if (isOpen) {
      setSelectedTypes(new Set(availableTypes));
    }
  }, [isOpen, availableTypes]);

  const handleToggle = (type: MismatchDetail['field']) => {
    const newSelected = new Set(selectedTypes);
    if (newSelected.has(type)) {
      newSelected.delete(type);
    } else {
      newSelected.add(type);
    }
    setSelectedTypes(newSelected);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Select Mismatches to Fix</DialogTitle>
          <DialogDescription>
            Choose which mismatch types you want to fix for the selected products.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {Array.from(availableTypes).map((type) => (
            <div key={type} className="flex items-center space-x-2">
              <Checkbox
                id={`fix-${type}`}
                checked={selectedTypes.has(type)}
                onCheckedChange={() => handleToggle(type)}
              />
              <Label htmlFor={`fix-${type}`} className="capitalize">
                {type.replace(/_/g, ' ')}
              </Label>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(Array.from(selectedTypes))}
            disabled={selectedTypes.size === 0}
          >
            Fix Selected ({selectedTypes.size})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
