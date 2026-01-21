import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MediaManagerImageCard } from './media-manager-image-card';
import { ShopifyProductImage } from '@/lib/types';

// Mock next/image
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...props} />;
  },
}));

// Mock lucide-react
jest.mock('lucide-react', () => ({
  Trash2: () => <svg data-testid="trash-icon" />,
  Link: () => <svg data-testid="link-icon" />,
  Check: () => <svg data-testid="check-icon" />,
}));

// Mock ResizeObserver for Tooltip
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe('MediaManagerImageCard', () => {
  const mockImage: ShopifyProductImage = {
    id: 123,
    src: 'http://example.com/img.jpg',
    variant_ids: [],
    position: 1,
    product_id: 1,
    width: 100,
    height: 100,
    created_at: '',
    updated_at: '',
    admin_graphql_api_id: '',
  };

  it('renders checkbox with aria-label', () => {
    render(
      <MediaManagerImageCard
        image={mockImage}
        isSelected={false}
        isAssigned={false}
        isMissingVariantMode={false}
        isSubmitting={false}
        onSelectionChange={jest.fn()}
        onDelete={jest.fn()}
      />
    );

    const checkbox = screen.getByRole('checkbox', { name: /select image 123/i });
    expect(checkbox).toBeInTheDocument();
  });

  it('shows tooltip when hovering delete button', async () => {
    const user = userEvent.setup();
    render(
      <MediaManagerImageCard
        image={mockImage}
        isSelected={false}
        isAssigned={false}
        isMissingVariantMode={false}
        isSubmitting={false}
        onSelectionChange={jest.fn()}
        onDelete={jest.fn()}
      />
    );

    const deleteButton = screen.getByRole('button', { name: /delete image 123/i });
    await user.hover(deleteButton);

    // Tooltip content might appear asynchronously
    await waitFor(() => {
        // Use getAllByText because Shadcn Tooltip might render a visually hidden copy for accessibility
        // and we want to ensure at least one is present.
      const tooltipTexts = screen.getAllByText('Delete image');
      expect(tooltipTexts.length).toBeGreaterThan(0);
      expect(tooltipTexts[0]).toBeInTheDocument();
    });
  });
});
