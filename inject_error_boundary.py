import re

with open('local_test_dashboard.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Add an ErrorBoundary wrapper to catch and display the exact React syntax/runtime error
error_boundary = """
    class ErrorBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, info: null };
      }
      static getDerivedStateFromError(error) {
        return { hasError: true, error };
      }
      componentDidCatch(error, info) {
        console.error("React Error Boundary Caught:", error, info);
        this.setState({ error, info });
      }
      render() {
        if (this.state.hasError) {
          return (
            <div style={{ padding: '40px', background: '#fee2e2', color: '#991b1b', fontFamily: 'sans-serif' }}>
              <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>Dashboard Render Error</h1>
              <p style={{ marginTop: '10px', fontSize: '14px' }}>{this.state.error && this.state.error.toString()}</p>
              <pre style={{ marginTop: '20px', background: 'white', padding: '20px', borderRadius: '8px', overflow: 'auto', fontSize: '12px' }}>
                {this.state.info && this.state.info.componentStack}
              </pre>
            </div>
          );
        }
        return this.props.children;
      }
    }
"""

if 'class ErrorBoundary' not in content:
    # Inject it right after `const { useState, useEffect, useRef, useMemo } = React;`
    content = content.replace("const { useState, useEffect, useRef, useMemo } = React;", "const { useState, useEffect, useRef, useMemo } = React;\n" + error_boundary)
    
    # Wrap the <App /> call in index.js at the bottom
    content = content.replace("root.render(<App />);", "root.render(<ErrorBoundary><App /></ErrorBoundary>);")

with open('local_test_dashboard.html', 'w', encoding='utf-8') as f:
    f.write(content)
