import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MediaManager } from './media-manager';
import { getProductWithImages, addImageFromUrl } from '@/app/actions';

// Mock server actions
jest.mock('@/app/actions', () => ({
  getProductWithImages: jest.fn(),
  addImageFromUrl: jest.fn(),
  assignImageToVariant: jest.fn(),
  deleteImage: jest.fn(),
}));

// Capture props passed to MediaManagerImageCard
const mockCapturedProps: any[] = [];

// Mock MediaManagerImageCard
jest.mock('./media-manager-image-card', () => ({
  MediaManagerImageCard: (props: any) => {
    mockCapturedProps.push(props);
    return <div data-testid="image-card">{props.image.id}</div>;
  }
}));

// Mock UI components to simplify test
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

jest.mock('@/components/ui/select', () => ({
  Select: ({ children }: any) => <div>{children}</div>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children }: any) => <div>{children}</div>,
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/media-manager-variant-row', () => ({
  VariantRow: () => <div>VariantRow</div>
}));

// Mock icons
jest.mock('lucide-react', () => ({
  Loader2: () => <div>Loader</div>,
  Trash2: () => <div>Trash</div>,
  Blocks: () => <div>Blocks</div>,
  AlertTriangle: () => <div>Alert</div>,
  Link: () => <div>Link</div>,
  Check: () => <div>Check</div>,
}));

describe('MediaManager Performance', () => {
  beforeEach(() => {
    mockCapturedProps.length = 0;
    jest.clearAllMocks();
  });

  it('maintains referential equality of onDelete handler when images are added', async () => {
    const user = userEvent.setup();
    const mockImages = [
      { id: 1, product_id: 123, src: 'https://example.com/img1.jpg', variant_ids: [] }
    ];
    const mockVariants = [
        { variantId: 'gid://shopify/ProductVariant/1', imageId: null }
    ];

    (getProductWithImages as jest.Mock).mockResolvedValue({
      images: mockImages,
      variants: mockVariants
    });

    (addImageFromUrl as jest.Mock).mockResolvedValue({
        success: true,
        image: { id: 2, product_id: 123, src: 'https://example.com/img2.jpg', variant_ids: [] }
    });

    render(<MediaManager productId="123" onImageCountChange={jest.fn()} />);

    // Wait for initial load
    await waitFor(() => expect(screen.getByTestId('image-card')).toBeInTheDocument());

    // Clear captured props from initial render
    const initialRenderCount = mockCapturedProps.length;
    // We expect 1 card rendered
    expect(initialRenderCount).toBeGreaterThan(0);

    // Get the onDelete from the last render of the first card
    const firstCardProps = mockCapturedProps[mockCapturedProps.length - 1];
    const firstOnDelete = firstCardProps.onDelete;

    // Reset captured props to track re-renders
    mockCapturedProps.length = 0;

    // Add a new image
    const input = screen.getByPlaceholderText('https://example.com/image.jpg');
    const addButton = screen.getByText('Add');

    await user.type(input, 'https://example.com/new.jpg');
    await user.click(addButton);

    // Wait for the second image to appear (this means re-render happened)
    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument());

    // Now check captured props.
    // We expect re-render of Card 1 and Card 2.
    // Actually, if optimized, Card 1 should NOT re-render if it's memoized and props are stable.
    // BUT we are mocking MediaManagerImageCard as a functional component (not memoized in the mock!).
    // Wait, the real component is memoized. The mock is just a function.
    // `MediaManager` renders the mock.
    // If `MediaManager` re-renders, it calls `MediaManagerImageCard` (mock).
    // If the props passed to it are EQUAL, React.memo (if applied to mock) would skip it.
    // But my mock is NOT wrapped in memo.
    // So the mock will be called every time `MediaManager` re-renders.
    // This is GOOD because we want to capture the PROPS passed by parent.

    // We want to verify that `onDelete` prop PASSED to the component is the SAME reference.

    // Find props for image id 1 (the existing one)
    // We want the LAST render, to ensure we are checking the state after image update
    const propsForImage1 = mockCapturedProps.filter(p => p.image.id === 1).pop();

    expect(propsForImage1).toBeDefined();

    // Check equality
    // Assertion:
    // After fix, this should pass.
    expect(propsForImage1.onDelete).toBe(firstOnDelete);
  });
});
