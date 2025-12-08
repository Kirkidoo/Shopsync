import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface UpdateTagsDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (customTag: string) => void;
    count: number;
}

export const UpdateTagsDialog = ({
    isOpen,
    onClose,
    onConfirm,
    count,
}: UpdateTagsDialogProps) => {
    const [customTag, setCustomTag] = useState('');

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Update Tags for {count} Products</DialogTitle>
                    <DialogDescription>
                        This will overwrite existing tags on Shopify with:
                        <br />
                        1. First 3 tags from CSV
                        <br />
                        2. Category from CSV
                        <br />
                        3. Custom tag (optional)
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="custom-tag" className="text-right">
                            Custom Tag
                        </Label>
                        <Input
                            id="custom-tag"
                            value={customTag}
                            onChange={(e) => setCustomTag(e.target.value)}
                            className="col-span-3"
                            placeholder="e.g. Black Friday Sale"
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={() => onConfirm(customTag)}>Update Tags</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
