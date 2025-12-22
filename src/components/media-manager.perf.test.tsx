
import React, { memo } from 'react';
import { render, screen, act } from '@testing-library/react';
import { MediaManager } from '@/components/media-manager';
import { getProductWithImages, deleteImage } from '@/app/actions';
import { ShopifyProductImage, Product } from '@/lib/types';

// Mock lucide-react
jest.mock('lucide-react', () => ({
  Loader2: () => <div />,
  Trash2: () => <div />,
  Blocks: () => <div />,
  AlertTriangle: () => <div />,
  Link: () => <div />,
  Check: () => <div />,
  ChevronDown: () => <div />,
  ChevronUp: () => <div />,
}));

// Mock actions
jest.mock('@/app/actions', () => ({
  getProductWithImages: jest.fn(),
  addImageFromUrl: jest.fn(),
  assignImageToVariant: jest.fn(),
  deleteImage: jest.fn(),
}));

// Mock useToast with stable reference to ensure hooks returning functions don't cause unnecessary re-renders
const mockToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// Mock MediaManagerImageCard to track renders
// It MUST be memoized to test the optimization
const MockImageCard = jest.fn((props) => {
  return (
    <div data-testid={`image-card-${props.image.id}`}>
      <button onClick={() => props.onDelete(props.image.id)}>Delete</button>
      <button onClick={() => props.onSelectionChange(props.image.id, true)}>Select</button>
    </div>
  );
});

const MemoizedMockImageCard = memo((props: any) => MockImageCard(props));
MemoizedMockImageCard.displayName = 'MemoizedMockImageCard';

// We need to mock the child component to spy on it
jest.mock('@/components/media-manager-image-card', () => ({
  MediaManagerImageCard: (props: any) => <MemoizedMockImageCard {...props} />,
}));

// Mock UI components
jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: any) => <div>{children}</div>,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogDescription: ({ children }: any) => <div>{children}</div>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
  DialogTrigger: ({ children }: any) => <div>{children}</div>,
  DialogClose: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children }: any) => <div>{children}</div>,
  AlertDialogContent: ({ children }: any) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: any) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: any) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
  AlertDialogTrigger: ({ children }: any) => <div>{children}</div>,
  AlertDialogAction: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
  AlertDialogCancel: ({ children }: any) => <button>{children}</button>,
}));

jest.mock('@/components/ui/select', () => ({
  Select: ({ children }: any) => <div>{children}</div>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children }: any) => <div>{children}</div>,
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/table', () => ({
  Table: ({ children }: any) => <div>{children}</div>,
  TableHeader: ({ children }: any) => <div>{children}</div>,
  TableBody: ({ children }: any) => <div>{children}</div>,
  TableRow: ({ children }: any) => <div>{children}</div>,
  TableHead: ({ children }: any) => <div>{children}</div>,
  TableCell: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/checkbox', () => ({
    Checkbox: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/tooltip', () => ({
    TooltipProvider: ({ children }: any) => <div>{children}</div>,
    Tooltip: ({ children }: any) => <div>{children}</div>,
    TooltipTrigger: ({ children }: any) => <div>{children}</div>,
    TooltipContent: ({ children }: any) => <div>{children}</div>,
}));

// Mock Next.js Image
jest.mock('next/image', () => ({
  __esModule: true,
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: any) => <img src={src} alt={alt} />,
}));

// Mock VariantRow
jest.mock('@/components/media-manager-variant-row', () => ({
  VariantRow: () => <div>VariantRow</div>,
}));

const mockImages: ShopifyProductImage[] = [
  { id: 1, src: '/img1.jpg', variant_ids: [], width: 100, height: 100, alt: '' },
  { id: 2, src: '/img2.jpg', variant_ids: [], width: 100, height: 100, alt: '' },
  { id: 3, src: '/img3.jpg', variant_ids: [], width: 100, height: 100, alt: '' },
];

const mockProduct: { variants: Partial<Product>[]; images: ShopifyProductImage[] } = {
  variants: [],
  images: mockImages,
};

describe('MediaManager Performance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getProductWithImages as jest.Mock).mockResolvedValue(mockProduct);
  });

  it('stabilizes handleDeleteImage to prevent extra renders', async () => {
    render(<MediaManager productId="123" onImageCountChange={jest.fn()} />);

    // Wait for data load
    await act(async () => {
      await Promise.resolve();
    });

    // Initial render
    expect(MockImageCard).toHaveBeenCalledTimes(3);
    MockImageCard.mockClear();

    // Setup delete mock
    (deleteImage as jest.Mock).mockResolvedValue({ success: true });

    // Find delete button for image 1 and click
    const deleteBtn = screen.getByTestId('image-card-1').querySelector('button');

    await act(async () => {
       deleteBtn?.click();
    });

    // Check how many times Image 2 rendered
    const calls = MockImageCard.mock.calls.filter(args => args[0].image.id === 2);

    // We expect 2 renders now (startSubmitting=true, then startSubmitting=false).
    // Without optimization (if handleDeleteImage changed), we'd see 3 or more because
    // the callback change would trigger an extra render or be part of a separate render.
    // Specifically, when images list updates, MediaManager renders. If handleDeleteImage is new,
    // MemoizedMockImageCard re-renders.

    // With optimization, handleDeleteImage is stable, so even when images list updates,
    // the card only sees 'isSubmitting' change (if it happens in the same batch).

    expect(calls.length).toBeLessThan(3);
  });
});
