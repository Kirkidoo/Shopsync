import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MediaManagerImageCard } from './media-manager-image-card';
import { ShopifyProductImage } from '@/lib/types';

// Mock Next/Image
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...props} />;
  },
}));

// Mock Lucide icons
// IMPORTANT: We must export named exports as well if the component uses them.
jest.mock('lucide-react', () => ({
  Trash2: () => <span data-testid="icon-trash" />,
  Link: () => <span data-testid="icon-link" />,
  Check: () => <span data-testid="icon-check" />,
}));

const mockImage: ShopifyProductImage = {
  id: 123,
  src: 'https://example.com/image.jpg',
  variant_ids: [],
  width: 100,
  height: 100,
  position: 1,
  product_id: 456,
  updated_at: '2023-01-01',
  created_at: '2023-01-01',
  admin_graphql_api_id: 'gid://shopify/ProductImage/123',
};

describe('MediaManagerImageCard', () => {
  const defaultProps = {
    image: mockImage,
    isSelected: false,
    isAssigned: false,
    isMissingVariantMode: false,
    isSubmitting: false,
    onSelectionChange: jest.fn(),
    onDelete: jest.fn(),
  };

  it('renders correctly', () => {
    render(<MediaManagerImageCard {...defaultProps} />);
    expect(screen.getByRole('img')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
    expect(screen.getByLabelText('Delete image 123')).toBeInTheDocument();
  });

  it('has correct accessibility classes on controls container', () => {
    render(<MediaManagerImageCard {...defaultProps} />);

    // Find the controls container. It's the one with absolute inset-0 and checkbox/button inside.
    const checkbox = screen.getByRole('checkbox');
    const controlsContainer = checkbox.parentElement;

    // We expect it to be hidden by default (opacity-0) and shown on hover (group-hover:opacity-100)
    expect(controlsContainer).toHaveClass('opacity-0');
    expect(controlsContainer).toHaveClass('group-hover:opacity-100');

    // VERIFY FIX: It should also have focus-within:opacity-100
    expect(controlsContainer).toHaveClass('focus-within:opacity-100');
  });

  it('verifies link icon visibility classes', () => {
    const propsWithAssignment = { ...defaultProps, isAssigned: true };
    render(<MediaManagerImageCard {...propsWithAssignment} />);

    const linkIcon = screen.getByTestId('icon-link');
    // The icon is wrapped in a div with classes
    const linkContainer = linkIcon.closest('div');

    expect(linkContainer).toHaveClass('group-hover:hidden');
    // VERIFY FIX: It should also have group-focus-within:hidden
    expect(linkContainer).toHaveClass('group-focus-within:hidden');
  });
});
