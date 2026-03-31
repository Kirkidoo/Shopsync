// src/components/ui/__mocks__/lucide-react.tsx
const React = require('react');

module.exports = new Proxy({}, {
  get: function (target, prop) {
    return function (props) {
      return React.createElement('svg', { ...props, 'data-testid': `icon-${String(prop)}` });
    };
  }
});
