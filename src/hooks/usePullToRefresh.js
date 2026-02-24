import { useRef, useState, useCallback } from 'react'

const THRESHOLD = 65
const MAX_PULL  = 90

export function usePullToRefresh(onRefresh, enabled = true) {
  const [pullY, setPullY] = useState(0)
  const [state, setState] = useState('idle')
  const startY   = useRef(0)
  const pulling  = useRef(false)
  const current  = useRef(0)

  const getScrollTop = (el) => {
    // Walk up to find the actual scroll container (.page-area)
    let node = el
    while (node) {
      if (node.scrollTop > 0) return node.scrollTop
      if (node.classList?.contains('page-area')) return node.scrollTop
      node = node.parentElement
    }
    return 0
  }

  const onTouchStart = useCallback((e) => {
    if (!enabled) return
    const scrollTop = getScrollTop(e.currentTarget)
    if (scrollTop > 2) return
    startY.current = e.touches[0].clientY
    pulling.current = true
    current.current = 0
  }, [enabled])

  const onTouchMove = useCallback((e) => {
    if (!pulling.current) return
    const dy = e.touches[0].clientY - startY.current
    if (dy <= 0) {
      // Check scroll position — if user scrolled, stop tracking pull
      const scrollTop = getScrollTop(e.currentTarget)
      if (scrollTop > 2) { pulling.current = false; setPullY(0); setState('idle') }
      return
    }
    // Dampen: feels natural
    const damped = Math.min(dy * 0.45, MAX_PULL)
    current.current = damped
    setPullY(damped)
    setState(damped >= THRESHOLD * 0.6 ? 'ready' : 'pulling')
  }, [])

  const onTouchEnd = useCallback(async () => {
    if (!pulling.current) return
    pulling.current = false
    if (current.current >= THRESHOLD * 0.6) {
      setState('refreshing')
      setPullY(38)
      try { await onRefresh() } catch {}
    }
    setPullY(0)
    setState('idle')
    current.current = 0
  }, [onRefresh])

  return { pullY, state, onTouchStart, onTouchMove, onTouchEnd }
}
