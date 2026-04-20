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
    console.error('PULSE ErrorBoundary:', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    // Tab-level error — don't take down the whole app, just this tab
    return (
      <div style={{
        padding: '40px 24px', textAlign: 'center', minHeight: 300,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
      }}>
        <div style={{ fontSize: '2rem', marginBottom: 12 }}>⚠️</div>
        <div style={{ color: '#E8E8E8', fontSize: '0.92rem', fontWeight: 700, marginBottom: 8 }}>
          Something went wrong in this tab
        </div>
        <div style={{ color: '#666', fontSize: '0.76rem', lineHeight: 1.6, marginBottom: 20, maxWidth: 280 }}>
          {this.state.error?.message || 'Unexpected error'}
        </div>
        <button
          onClick={() => this.setState({ hasError: false, error: null })}
          style={{
            background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.3)',
            color: '#00E5FF', padding: '8px 20px', borderRadius: 8,
            fontFamily: 'var(--font-mono)', fontSize: '0.76rem', cursor: 'pointer'
          }}>
          Retry
        </button>
      </div>
    )
  }
}
