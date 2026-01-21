import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MediaManagerImageCard } from './media-manager-image-card';
import { ShopifyProductImage } from '@/lib/types';
import userEvent from '@testing-library/user-event';
import { TooltipProvider } from '@radix-ui/react-tooltip';

// Mock Lucide icons
jest.mock('lucide-react', () => ({
  Trash2: () => <div data-testid="trash-icon" />,
  Link: () => <div data-testid="link-icon" />,
  Check: () => <div data-testid="check-icon" />,
}));

// Mock ResizeObserver for Tooltip
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock next/image
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...props} alt={props.alt || ''} />;
  },
}));

describe('MediaManagerImageCard', () => {
  const mockImage: ShopifyProductImage = {
    id: 123,
    product_id: 456,
    src: 'https://example.com/image.jpg',
    variant_ids: [],
  };

  const defaultProps = {
    image: mockImage,
    isSelected: false,
    isAssigned: false,
    isMissingVariantMode: false,
    isSubmitting: false,
    onSelectionChange: jest.fn(),
    onDelete: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders image correctly', () => {
    render(<MediaManagerImageCard {...defaultProps} />);
    const image = screen.getByRole('img', { name: /product image 123/i });
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute('src', 'https://example.com/image.jpg');
  });

  it('shows checkbox when hovered or selected', async () => {
    const user = userEvent.setup();
    render(<MediaManagerImageCard {...defaultProps} />);

    // Initially checkbox might be hidden via CSS opacity, but it exists in DOM
    const checkbox = screen.getByRole('checkbox', { name: /select image 123/i });
    expect(checkbox).toBeInTheDocument();

    // Check selection logic
    await user.click(checkbox);
    expect(defaultProps.onSelectionChange).toHaveBeenCalledWith(123, true);
  });

  it('shows delete button and opens confirmation dialog', async () => {
    const user = userEvent.setup();
    render(<MediaManagerImageCard {...defaultProps} />);

    const deleteBtn = screen.getByRole('button', { name: /delete image 123/i });
    await user.click(deleteBtn);

    // Dialog should appear
    expect(screen.getByText('Delete this image?')).toBeInTheDocument();

    // Click confirm
    const confirmBtn = screen.getByRole('button', { name: 'Delete Image' });
    await user.click(confirmBtn);

    expect(defaultProps.onDelete).toHaveBeenCalledWith(123);
  });

  it('shows assigned indicator when assigned', async () => {
      // Wrap in TooltipProvider because the component uses Tooltip
      render(
        <TooltipProvider>
          <MediaManagerImageCard {...defaultProps} isAssigned={true} />
        </TooltipProvider>
      );

      // The link icon indicates assignment
      expect(screen.getByTestId('link-icon')).toBeInTheDocument();
  });
});
