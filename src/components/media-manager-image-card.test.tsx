import { render, screen, waitFor } from '@testing-library/react';
import { MediaManagerImageCard } from './media-manager-image-card';
import { ShopifyProductImage } from '@/lib/types';
import userEvent from '@testing-library/user-event';

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

  it('renders delete tooltip on hover', async () => {
    const user = userEvent.setup();
    render(
      <MediaManagerImageCard
        image={mockImage}
        isSelected={true}
        isAssigned={false}
        isMissingVariantMode={false}
        isSubmitting={false}
        onSelectionChange={jest.fn()}
        onDelete={jest.fn()}
      />
    );

    const deleteButton = screen.getByRole('button', { name: /delete image 123/i });
    await user.hover(deleteButton);

    await waitFor(() => {
        // Use getAllByText because Radix Tooltip might duplicate text for accessibility
        const tooltipTexts = screen.getAllByText(/delete image/i);
        expect(tooltipTexts.length).toBeGreaterThan(0);
        expect(tooltipTexts[0]).toBeInTheDocument();
    });
  });

  it('positions assigned icon at bottom-right', () => {
    render(
      <MediaManagerImageCard
        image={mockImage}
        isSelected={true}
        isAssigned={true}
        isMissingVariantMode={false}
        isSubmitting={false}
        onSelectionChange={jest.fn()}
        onDelete={jest.fn()}
      />
    );

    // Find the Link icon container
    const linkIcon = screen.getByTestId('link-icon');
    const container = linkIcon.closest('div');

    // Check for the class
    expect(container).toHaveClass('bottom-1.5');
    expect(container).toHaveClass('right-1.5');
  });
});
