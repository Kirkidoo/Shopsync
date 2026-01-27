const shopifyApi = jest.fn(() => ({
  clients: {
    Graphql: jest.fn(),
    Rest: jest.fn(),
  },
}));
const Session = jest.fn();
const LATEST_API_VERSION = '2024-01';

module.exports = {
  shopifyApi,
  Session,
  LATEST_API_VERSION,
};
