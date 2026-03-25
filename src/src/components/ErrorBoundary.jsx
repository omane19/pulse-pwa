import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    // Log to console in dev — could wire to Sentry here in future
    console.error('PULSE Error Boundary caught:', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div style={{
        minHeight: '100vh', background: '#000', display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '24px', textAlign: 'center'
      }}>
        <div style={{ fontSize: '2.5rem', marginBottom: 16 }}>⚠️</div>
        <div style={{ color: '#E8E8E8', fontSize: '1.1rem', fontWeight: 700, marginBottom: 8 }}>
          Something went wrong
        </div>
        <div style={{ color: '#666', fontSize: '0.82rem', lineHeight: 1.6, marginBottom: 24, maxWidth: 320 }}>
          {this.state.error?.message || 'An unexpected error occurred.'}
        </div>
        <button
          onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload() }}
          style={{
            background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.3)',
            color: '#00E5FF', padding: '10px 24px', borderRadius: 8,
            fontFamily: 'var(--font-mono)', fontSize: '0.8rem', cursor: 'pointer'
          }}>
          Reload App
        </button>
      </div>
    )
  }
}
