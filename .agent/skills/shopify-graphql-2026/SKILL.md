---
name: shopify-graphql-2026
description: Architecture rules and syntax templates for managing Shopify products using the modern 2026-01 GraphQL Admin API.
---

# Shopify GraphQL Product Management (2026-01)

You are acting as a Shopify API Architect. When reading, writing, or updating Shopify data, you must strictly adhere to the 2026-01 Admin API specifications.

## 1. API Versioning & Endpoint
All requests must interact with the `2026-01` endpoint. Do not use older versions or the REST API.
**Endpoint Format:** `https://{shop}.myshopify.com/admin/api/2026-01/graphql.json`

## 2. Authentication
All requests require the standard Shopify access token header. Avoid basic auth or outdated methods.
**Header:** `X-Shopify-Access-Token: {your_access_token}`

## 3. Common API Patterns

### Pagination (The Connection Pattern)
Never request raw arrays for lists. Always use the Connection pattern (`edges`, `node`, `pageInfo`) and process cursors for pagination.

```graphql
query getProducts($cursor: String) {
  products(first: 50, after: $cursor) {
    pageInfo {
      hasNextPage
      endCursor
    }
    edges {
      node {
        id
        title
      }
    }
  }
}
```

### Mutation Error Handling
Every mutation MUST request the `userErrors` block to catch and handle API rejections gracefully.

```graphql
# Always include this block in your mutations:
userErrors {
  field
  message
}
```

## 4. Key 2026 Mutations

### A. Product Creation (`productCreate`)
Uses the modern `productInput` structure. Note that variants and media are often handled sequentially or via bulk operations in complex catalogs.

```graphql
mutation createProduct($input: ProductInput!) {
  productCreate(input: $input) {
    product {
      id
      title
      handle
    }
    userErrors {
      field
      message
    }
  }
}
```

### B. Inventory Management (`inventorySetQuantities`)
This is the modern way to update stock. Do not use deprecated `inventoryAdjustQuantity` or `inventoryLevelUpdate`.

```graphql
mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
  inventorySetQuantities(input: $input) {
    inventoryAdjustmentGroup {
      createdAt
      reason
      changes {
        name
        delta
        quantityAfterChange
      }
    }
    userErrors {
      field
      message
    }
  }
}
```

### C. Bulk Variant Updates (`productVariantsBulkUpdate`)
Use this when modifying prices, SKUs, or barcodes for multiple variants of a single product simultaneously. 

```graphql
mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
    product {
      id
    }
    productVariants {
      id
      price
      sku
    }
    userErrors {
      field
      message
    }
  }
}
```

## 5. Metaobjects & Metafields
Metafields are a core concept in 2026. Use `metafieldsSet` (or `metafieldUpsert`) to rapidly inject custom data.

```graphql
mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields {
      id
      namespace
      key
      value
    }
    userErrors {
      field
      message
    }
  }
}
```

## 6. Query Best Practices & Cost Limits
- **Avoid Deep Nesting:** Shopify limits query complexity (costs). Do not deeply nest connections.
- **Fetch Only What Is Needed:** Declare exact scalar fields required. Do not over-fetch.
- **Bulk Operations:** If you are iterating over thousands of products, avoid standard paginated queries. Utilize the `bulkOperationRunQuery` mutation instead to prevent rate limiting and cost exception errors.
