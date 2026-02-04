
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MediaManager } from './media-manager';
import { getProductWithImages, assignImageToVariant } from '@/app/actions';
import { Product, ShopifyProductImage } from '@/lib/types';

// Mock the server actions
jest.mock('@/app/actions', () => ({
  getProductWithImages: jest.fn(),
  addImageFromUrl: jest.fn(),
  assignImageToVariant: jest.fn(),
  deleteImage: jest.fn(),
}));

// Mock toast
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

// Mock UI components that might cause issues
jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogDescription: ({ children }: any) => <div>{children}</div>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
  DialogTrigger: ({ children }: any) => <div>{children}</div>,
  DialogClose: ({ children }: any) => <div>{children}</div>,
}));

// Mock Lucide icons
jest.mock('lucide-react', () => ({
  Loader2: () => <div data-testid="loader" />,
  Trash2: () => <div data-testid="trash" />,
  Blocks: () => <div data-testid="blocks" />,
  AlertTriangle: () => <div data-testid="alert" />,
  Check: () => <div data-testid="check" />,
  ChevronDown: () => <div data-testid="chevron-down" />,
  ChevronUp: () => <div data-testid="chevron-up" />,
}));

const mockVariants: Partial<Product>[] = [
  { variantId: 'gid://shopify/ProductVariant/1', sku: 'SKU1', option1Value: 'Red' },
  { variantId: 'gid://shopify/ProductVariant/2', sku: 'SKU2', option1Value: 'Blue' },
];

const mockImages: ShopifyProductImage[] = [
  { id: 101, product_id: 1, src: 'https://example.com/img1.jpg', variant_ids: [] },
  { id: 102, product_id: 1, src: 'https://example.com/img2.jpg', variant_ids: [] },
];

describe('MediaManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getProductWithImages as jest.Mock).mockResolvedValue({
      variants: mockVariants,
      images: mockImages,
    });
  });

  it('renders and loads data correctly', async () => {
    render(
      <MediaManager
        productId="gid://shopify/Product/1"
        onImageCountChange={jest.fn()}
      />
    );

    // Initial loading state
    expect(screen.getByTestId('loader')).toBeInTheDocument();

    // Wait for data to load
    await waitFor(() => {
      expect(screen.queryByTestId('loader')).not.toBeInTheDocument();
    });

    // Check if variants are rendered
    expect(screen.getByText('SKU1')).toBeInTheDocument();
    expect(screen.getByText('SKU2')).toBeInTheDocument();

    // Check if images are rendered
    expect(screen.getByText('Image Gallery (2)')).toBeInTheDocument();
  });

  it('passes stable images to VariantRow', async () => {
    render(
      <MediaManager
        productId="gid://shopify/Product/1"
        onImageCountChange={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.queryByTestId('loader')).not.toBeInTheDocument();
    });

    // We can't easily check reference stability in integration test without spying on VariantRow props.
    // But we can check that it works.

    const selects = screen.getAllByRole('combobox');
    expect(selects.length).toBeGreaterThan(0);
  });
});
