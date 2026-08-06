import React from 'react';
import './ConsultantCards/ConsultantCards.css';
import { Box, Spinner, Text } from '@shopify/polaris';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box padding="800" display="flex" alignItems="center" justifyContent="center">
          <Box display="flex" alignItems="center" gap="200">
            <Spinner accessibilityLabel="Loading" size="large" />
            <Text as="span">Loading...</Text>
          </Box>
        </Box>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

