import { z } from 'zod';

// --- Zod Schemas ---

export const ShopifyGraphQLErrorSchema = z.object({
  message: z.string(),
  locations: z.array(z.object({ line: z.number(), column: z.number() })).optional(),
  path: z.array(z.string().or(z.number())).optional(),
  extensions: z.object({
    code: z.string().optional(),
    documentation: z.string().optional(),
  }).optional(),
});

// Helper for generic GraphQL response validation
export const createGraphQLResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) => z.object({
  data: dataSchema.nullable().optional(),
  errors: z.array(ShopifyGraphQLErrorSchema).optional(),
  extensions: z.object({
    cost: z.object({
      requestedQueryCost: z.number(),
      actualQueryCost: z.number(),
      throttleStatus: z.object({
        maximumAvailable: z.number(),
        currentlyAvailable: z.number(),
        restoreRate: z.number(),
      }),
    }).optional(),
  }).optional(),
});

export const MutationUserErrorSchema = z.object({
  field: z.array(z.string()).nullable().optional(),
  message: z.string(),
  code: z.string().optional(),
});

export type MutationUserError = z.infer<typeof MutationUserErrorSchema>;

export class ShopifyAPIError extends Error {
  constructor(public userErrors: MutationUserError[]) {
    super(userErrors.map(e => e.message).join(', '));
    this.name = 'ShopifyAPIError';
  }
}

// --- Shared Schemas ---

export const InventoryItemMeasurementSchema = z.object({
  weight: z.object({
    value: z.number(),
    unit: z.string(),
  }).nullable().optional(),
});

export const InventoryLevelSchema = z.object({
  quantities: z.array(z.object({
    name: z.string(),
    quantity: z.number()
  })).optional(),
  location: z.object({
    id: z.string(),
  }),
});

export const InventoryItemSchema = z.object({
  id: z.string(),
  measurement: InventoryItemMeasurementSchema.nullable().optional(),
  inventoryLevels: z.object({
    edges: z.array(z.object({
      node: InventoryLevelSchema
    }))
  }).optional(),
});

// --- Response Data Schemas ---

export const ProductSetResponseSchema = z.object({
  productSet: z.object({
    product: z.object({
      id: z.string(),
      title: z.string(),
      handle: z.string(),
      vendor: z.string().nullable(),
      productType: z.string().nullable(),
      tags: z.array(z.string()),
      bodyHtml: z.string().nullable(),
      templateSuffix: z.string().nullable(),
      status: z.string(),
      variants: z.object({
        edges: z.array(z.object({
          node: z.object({
            id: z.string(),
            sku: z.string().nullable(),
            inventoryItem: z.object({ id: z.string() }),
          })
        }))
      }),
      images: z.object({
        edges: z.array(z.object({
          node: z.object({
            id: z.string(),
            url: z.string(),
          })
        }))
      }),
    }).nullable().optional(),
    userErrors: z.array(MutationUserErrorSchema),
  }).nullable().optional(),
});

export const ProductUpdateResponseSchema = z.object({
  productUpdate: z.object({
    product: z.object({ id: z.string() }).nullable().optional(),
    userErrors: z.array(MutationUserErrorSchema),
  }).nullable().optional(),
});

export const ProductVariantCreateResponseSchema = z.object({
  productVariantCreate: z.object({
    productVariant: z.object({
      id: z.string(),
      sku: z.string().nullable(),
      price: z.string(),
      compareAtPrice: z.string().nullable(),
      inventoryItem: z.object({ id: z.string() }),
      product: z.object({ id: z.string(), title: z.string() }),
    }).nullable().optional(),
    userErrors: z.array(MutationUserErrorSchema),
  }).nullable().optional(),
});

export const ProductVariantsBulkUpdateResponseSchema = z.object({
  productVariantsBulkUpdate: z.object({
    productVariants: z.array(z.object({ id: z.string() })).nullable().optional(),
    userErrors: z.array(MutationUserErrorSchema),
  }).nullable().optional(),
});

export const ProductDeleteResponseSchema = z.object({
  productDelete: z.object({
    deletedProductId: z.string().nullable().optional(),
    userErrors: z.array(MutationUserErrorSchema),
  }).nullable().optional(),
});

export const ProductVariantDeleteResponseSchema = z.object({
  productVariantDelete: z.object({
    deletedProductVariantId: z.string().nullable().optional(),
    userErrors: z.array(MutationUserErrorSchema),
  }).nullable().optional(),
});

export const InventorySetQuantitiesResponseSchema = z.object({
  inventorySetQuantities: z.object({
    inventoryAdjustmentGroup: z.object({ id: z.string() }).nullable().optional(),
    userErrors: z.array(MutationUserErrorSchema),
  }).nullable().optional(),
});

export const InventoryBulkToggleActivationResponseSchema = z.object({
  inventoryBulkToggleActivation: z.object({
    userErrors: z.array(MutationUserErrorSchema),
  }).nullable().optional(),
});

export const BulkOperationRunQueryResponseSchema = z.object({
  bulkOperationRunQuery: z.object({
    bulkOperation: z.object({ id: z.string(), status: z.string() }).nullable().optional(),
    userErrors: z.array(MutationUserErrorSchema),
  }).nullable().optional(),
});

export const CollectionAddProductsResponseSchema = z.object({
  collectionAddProducts: z.object({
    userErrors: z.array(MutationUserErrorSchema),
  }).nullable().optional(),
});

export const ProductCreateMediaResponseSchema = z.object({
  productCreateMedia: z.object({
    media: z.array(z.object({
      id: z.string(),
      image: z.object({ url: z.string() }).optional(),
    })).nullable().optional(),
    userErrors: z.array(MutationUserErrorSchema),
  }).nullable().optional(),
});

export const ProductDeleteMediaResponseSchema = z.object({
  productDeleteMedia: z.object({
    deletedMediaIds: z.array(z.string()).nullable().optional(),
    userErrors: z.array(MutationUserErrorSchema),
  }).nullable().optional(),
});

export const PublishablePublishResponseSchema = z.object({
  publishablePublish: z.object({
    publishable: z.object({
      availablePublicationsCount: z.object({ count: z.number() }).optional(),
    }).nullable().optional(),
    userErrors: z.array(MutationUserErrorSchema),
  }).nullable().optional(),
});

export const TagsAddResponseSchema = z.object({
  tagsAdd: z.object({
    node: z.object({ id: z.string() }).nullable().optional(),
    userErrors: z.array(MutationUserErrorSchema),
  }).nullable().optional(),
});

export const TagsRemoveResponseSchema = z.object({
  tagsRemove: z.object({
    node: z.object({ id: z.string() }).nullable().optional(),
    userErrors: z.array(MutationUserErrorSchema),
  }).nullable().optional(),
});

export const GetProductByHandleQuerySchema = z.object({
  productByHandle: z.object({
    id: z.string(),
    title: z.string(),
    handle: z.string(),
    vendor: z.string().nullable().optional(),
    productType: z.string().nullable().optional(),
    tags: z.array(z.string()),
    bodyHtml: z.string().nullable().optional(),
    templateSuffix: z.string().nullable().optional(),
    status: z.string(),
    variants: z.object({
      edges: z.array(z.object({
        node: z.object({
          id: z.string(),
          sku: z.string().nullable(),
          price: z.string(),
          compareAtPrice: z.string().nullable().optional(),
          inventoryQuantity: z.number().optional(),
          inventoryItem: InventoryItemSchema.nullable().optional(),
        })
      }))
    }),
    images: z.object({
      edges: z.array(z.object({
        node: z.object({
          id: z.string(),
          url: z.string(),
        })
      }))
    }),
  }).nullable().optional(),
});

export const GetCollectionByTitleQuerySchema = z.object({
  collections: z.object({
    edges: z.array(z.object({
      node: z.object({ id: z.string() })
    }))
  })
});

export const GetAllPublicationsQuerySchema = z.object({
  publications: z.object({
    edges: z.array(z.object({
      node: z.object({ id: z.string(), name: z.string() })
    }))
  })
});

export const GetCurrentBulkOperationQuerySchema = z.object({
  currentBulkOperation: z.object({
    id: z.string(),
    status: z.string(),
    errorCode: z.string().nullable().optional(),
    createdAt: z.string(),
    completedAt: z.string().nullable().optional(),
    objectCount: z.string().nullable().optional(),
    fileSize: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
  }).nullable().optional(),
});

export const GetLocationsQuerySchema = z.object({
  locations: z.object({
    edges: z.array(z.object({
      node: z.object({ id: z.string(), name: z.string() })
    }))
  })
});

export const GetFullProductQuerySchema = z.object({
  product: z.object({
    id: z.string(),
    title: z.string(),
    handle: z.string(),
    vendor: z.string().nullable().optional(),
    productType: z.string().nullable().optional(),
    tags: z.array(z.string()),
    bodyHtml: z.string().nullable().optional(),
    templateSuffix: z.string().nullable().optional(),
    status: z.string(),
    variants: z.object({
      edges: z.array(z.object({
        node: z.object({
          id: z.string(),
          sku: z.string().nullable(),
          price: z.string(),
          compareAtPrice: z.string().nullable().optional(),
          inventoryQuantity: z.number().optional(),
          inventoryItem: InventoryItemSchema.nullable().optional(),
        })
      }))
    }),
    images: z.object({
      edges: z.array(z.object({
        node: z.object({
          id: z.string(),
          url: z.string(),
        })
      }))
    }),
  }).nullable().optional(),
});



export type ShopifyFullProduct = NonNullable<z.infer<typeof GetFullProductQuerySchema>['product']>;
export type ShopifyProductVariant = ShopifyFullProduct['variants']['edges'][0]['node'];
export type ShopifyLocation = z.infer<typeof GetLocationsQuerySchema>['locations']['edges'][0]['node'];

export const ProductVariantNodeSchema = z.object({
  id: z.string(),
  sku: z.string().nullable(),
  price: z.string(),
  compareAtPrice: z.string().nullable().optional(),
  inventoryQuantity: z.number().optional(),
  inventoryItem: InventoryItemSchema.nullable().optional(),
  image: z.object({ id: z.string() }).nullable().optional(),
  product: z.object({
    id: z.string(),
    title: z.string(),
    handle: z.string(),
    bodyHtml: z.string().nullable().optional(),
    templateSuffix: z.string().nullable().optional(),
    tags: z.array(z.string()),
    featuredImage: z.object({ url: z.string() }).nullable().optional(),
  }),
});

export const ProductVariantsEdgeSchema = z.object({
  node: ProductVariantNodeSchema
});

export const GetVariantsBySkuQuerySchema = z.object({
  productVariants: z.object({
    edges: z.array(ProductVariantsEdgeSchema),
    pageInfo: z.object({
      hasNextPage: z.boolean(),
      endCursor: z.string().nullable().optional(),
    }).optional(),
  })
});

export const GetUpdatedProductsQuerySchema = z.object({
  products: z.object({
    edges: z.array(z.object({
      node: z.object({
        id: z.string(),
        title: z.string(),
        handle: z.string(),
        bodyHtml: z.string().nullable().optional(),
        vendor: z.string().nullable().optional(),
        productType: z.string().nullable().optional(),
        tags: z.array(z.string()),
        templateSuffix: z.string().nullable().optional(),
        featuredImage: z.object({ url: z.string() }).nullable().optional(),
        variants: z.object({
          edges: z.array(z.object({
            node: z.object({
              id: z.string(),
              sku: z.string().nullable(),
              price: z.string(),
              compareAtPrice: z.string().nullable().optional(),
              inventoryItem: InventoryItemSchema.nullable().optional(),
              image: z.object({ id: z.string() }).nullable().optional(),
            })
          }))
        })
      })
    })),
    pageInfo: z.object({
      hasNextPage: z.boolean(),
      endCursor: z.string().nullable().optional(),
    })
  })
});

// --- GraphQL Queries & Mutations ---

export const GET_VARIANTS_BY_SKU_QUERY = `
  query getVariantsBySku($query: String!) {
    productVariants(first: 250, query: $query) {
      edges {
        node {
          id
          sku
          price
          compareAtPrice
          inventoryQuantity
          inventoryItem {
            id
            measurement {
              weight {
                value
                unit
              }
            }
            inventoryLevels(first: 50) {
              edges {
                node {
                  quantities(names: ["available"]) {
                    name
                    quantity
                  }
                  location {
                    id
                  }
                }
              }
            }
          }
          image {
            id
          }
          product {
            id
            title
            handle
            bodyHtml
            templateSuffix
            tags
            featuredImage {
              url
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const GET_PRODUCT_BY_HANDLE_QUERY = `
  query getProductByHandle($handle: String!) {
    productByHandle(handle: $handle) {
      id
      handle
      images(first: 100) {
        edges {
            node {
                id
                url
            }
        }
      }
    }
  }
`;

export const GET_COLLECTION_BY_TITLE_QUERY = `
  query getCollectionByTitle($query: String!) {
    collections(first: 1, query: $query) {
      edges {
        node {
          id
        }
      }
    }
  }
`;

export const GET_ALL_PUBLICATIONS_QUERY = `
  query getPublications {
    publications(first: 50) {
      edges {
        node {
          id
          name
        }
      }
    }
  }
`;

export const PUBLISHABLE_PUBLISH_MUTATION = `
  mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) {
      publishable {
        ... on Product {
          availablePublicationsCount {
            count
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const UPDATE_PRODUCT_MUTATION = `
    mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
            product {
                id
            }
            userErrors {
                field
                message
            }
        }
    }
`;

export const GET_UPDATED_PRODUCTS_QUERY = `
  query getUpdatedProducts($query: String!, $cursor: String) {
    products(first: 5, query: $query, after: $cursor) {
      edges {
        node {
          id
          title
          handle
          bodyHtml
          vendor
          productType
          tags
          templateSuffix
          featuredImage {
            url
          }
          variants(first: 20) {
            edges {
              node {
                id
                sku
                price
                compareAtPrice
                inventoryItem {
                  id
                  measurement {
                    weight {
                      value
                      unit
                    }
                  }
                  inventoryLevels(first: 5) {
                    edges {
                      node {
                        quantities(names: ["available"]) {
                          name
                          quantity
                        }
                        location {
                          id
                        }
                      }
                    }
                  }
                }
                image {
                  id
                }
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const BULK_OPERATION_RUN_QUERY_MUTATION = `
  mutation bulkOperationRunQuery($query: String!) {
    bulkOperationRunQuery(query: $query) {
      bulkOperation {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const GET_CURRENT_BULK_OPERATION_QUERY = `
  query {
    currentBulkOperation {
      id
      status
      errorCode
      createdAt
      completedAt
      objectCount
      fileSize
      url
    }
  }
`;

export const ADD_TAGS_MUTATION = `
  mutation tagsAdd($id: ID!, $tags: [String!]!) {
    tagsAdd(id: $id, tags: $tags) {
      node {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const REMOVE_TAGS_MUTATION = `
  mutation tagsRemove($id: ID!, $tags: [String!]!) {
    tagsRemove(id: $id, tags: $tags) {
      node {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const INVENTORY_SET_QUANTITIES_MUTATION = `
    mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
        inventorySetQuantities(input: $input) {
            inventoryAdjustmentGroup {
                id
            }
            userErrors {
                field
                message
                code
            }
        }
    }
`;

export const PRODUCT_SET_MUTATION = `
  mutation productSet($synchronous: Boolean!, $input: ProductSetInput!) {
    productSet(synchronous: $synchronous, input: $input) {
      product {
        id
        title
        handle
        vendor
        productType
        tags
        bodyHtml
        templateSuffix
        status
        variants(first: 250) {
          edges {
            node {
              id
              sku
              inventoryItem {
                id
              }
            }
          }
        }
        images(first: 250) {
          edges {
            node {
              id
              url
            }
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const PRODUCT_VARIANT_CREATE_MUTATION = `
  mutation productVariantCreate($input: ProductVariantInput!) {
    productVariantCreate(input: $input) {
      productVariant {
        id
        sku
        price
        compareAtPrice
        inventoryItem {
          id
        }
        product {
          id
          title
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const UPDATE_PRODUCT_VARIANT_MUTATION = `
  mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const PRODUCT_DELETE_MUTATION = `
  mutation productDelete($input: ProductDeleteInput!) {
    productDelete(input: $input) {
      deletedProductId
      userErrors {
        field
        message
      }
    }
  }
`;

export const PRODUCT_VARIANT_DELETE_MUTATION = `
  mutation productVariantDelete($id: ID!) {
     productVariantDelete(id: $id) {
        deletedProductVariantId
        userErrors {
           field
           message
        }
     }
  }
`;

export const INVENTORY_BULK_TOGGLE_MUTATION = `
  mutation inventoryBulkToggleActivation($inventoryItemId: ID!, $inventoryItemUpdates: [InventoryBulkToggleActivationInput!]!) {
    inventoryBulkToggleActivation(inventoryItemId: $inventoryItemId, inventoryItemUpdates: $inventoryItemUpdates) {
      userErrors {
        field
        message
      }
    }
  }
`;

export const COLLECTION_ADD_PRODUCTS_MUTATION = `
  mutation collectionAddProducts($id: ID!, $productIds: [ID!]!) {
    collectionAddProducts(id: $id, productIds: $productIds) {
      userErrors {
        field
        message
      }
    }
  }
`;

export const PRODUCT_CREATE_MEDIA_MUTATION = `
  mutation productCreateMedia($media: [CreateMediaInput!]!, $productId: ID!) {
    productCreateMedia(media: $media, productId: $productId) {
      media {
        id
        ... on MediaImage {
          image {
            url
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const PRODUCT_DELETE_MEDIA_MUTATION = `
  mutation productDeleteMedia($mediaIds: [ID!]!, $productId: ID!) {
    productDeleteMedia(mediaIds: $mediaIds, productId: $productId) {
      deletedMediaIds
      userErrors {
        field
        message
      }
    }
  }
`;

export const GET_LOCATIONS_QUERY = `
  query getLocations {
    locations(first: 250) {
      edges {
        node {
          id
          name
        }
      }
    }
  }
`;

export const GET_FULL_PRODUCT_QUERY = `
  query getFullProduct($id: ID!) {
    product(id: $id) {
       id
       title
       handle
       vendor
       productType
       tags
       bodyHtml
       templateSuffix
       status
       variants(first: 250) {
         edges {
           node {
              id
              sku
              price
              compareAtPrice
              inventoryQuantity
              inventoryItem {
                  id
                  measurement {
                      weight { value unit }
                  }
              }
           }
         }
       }
       images(first: 250) {
         edges {
           node {
             id
             url
           }
         }
       }
  }
`;

export const convertWeightToGrams = (
  weight: number | null | undefined,
  unit: string | null | undefined
): number | null => {
  if (weight === null || weight === undefined) return null;
  const upperUnit = unit?.toUpperCase();
  if (upperUnit === 'G' || upperUnit === 'GRAMS') return weight;
  if (upperUnit === 'KG' || upperUnit === 'KILOGRAMS') return weight * 1000;
  if (upperUnit === 'LB' || upperUnit === 'POUNDS') return weight * 453.592;
  if (upperUnit === 'OZ' || upperUnit === 'OUNCES') return weight * 28.3495;
  return weight;
};
