/**
 * Virtual DOM 구현 (난이도 9/10)
 * React와 유사한 Virtual DOM diff 알고리즘과 렌더링 시스템
 * 복잡한 재귀 알고리즘, 효율적인 DOM 조작, 라이프사이클 관리
 */

class VirtualDOM {
  constructor() {
    this.rootElement = null;
    this.currentVTree = null;
    this.componentInstances = new WeakMap();
    this.fiberRoot = null;
    this.workInProgressRoot = null;
    this.pendingEffects = [];
    this.updateQueue = [];
    this.isRendering = false;
    this.requestIdleCallbackId = null;
  }

  /**
   * Virtual Node 생성
   */
  createElement(type, props, ...children) {
    return {
      type,
      props: props || {},
      children: children.flat().filter(child =>
        child !== null && child !== undefined && child !== false
      ).map(child =>
        typeof child === 'object' ? child : this.createTextElement(child)
      ),
      key: props?.key || null,
      ref: props?.ref || null,
      $$typeof: Symbol.for('vdom.element')
    };
  }

  /**
   * 텍스트 노드 생성
   */
  createTextElement(text) {
    return {
      type: 'TEXT_ELEMENT',
      props: { nodeValue: String(text) },
      children: [],
      $$typeof: Symbol.for('vdom.text')
    };
  }

  /**
   * Fiber 노드 생성
   */
  createFiber(vnode, parent = null) {
    return {
      type: vnode.type,
      props: vnode.props,
      key: vnode.key,
      stateNode: null,
      child: null,
      sibling: null,
      parent,
      alternate: null,
      effectTag: null,
      effects: [],
      hooks: [],
      memoizedState: null,
      updateQueue: null,
      dependencies: null
    };
  }

  /**
   * 컴포넌트 클래스
   */
  static Component = class {
    constructor(props) {
      this.props = props;
      this.state = {};
      this.refs = {};
      this._fiber = null;
      this._hooks = [];
      this._effects = [];
    }

    setState(partialState, callback) {
      const fiber = this._fiber;
      if (!fiber) return;

      const update = {
        partialState: typeof partialState === 'function'
          ? partialState(this.state, this.props)
          : partialState,
        callback,
        next: null
      };

      // 업데이트 큐에 추가
      if (!fiber.updateQueue) {
        fiber.updateQueue = { first: update, last: update };
      } else {
        fiber.updateQueue.last.next = update;
        fiber.updateQueue.last = update;
      }

      // 리렌더링 스케줄
      this.scheduleUpdate(fiber);
    }

    forceUpdate(callback) {
      this.setState({}, callback);
    }

    scheduleUpdate(fiber) {
      // 우선순위 기반 업데이트 스케줄링
      const priority = this.calculatePriority(fiber);
      this.requestUpdate(fiber, priority);
    }

    calculatePriority(fiber) {
      // 간단한 우선순위 계산 로직
      if (fiber.props.priority === 'high') return 1;
      if (fiber.props.priority === 'low') return 3;
      return 2;
    }

    requestUpdate(fiber, priority) {
      // Concurrent Mode 시뮬레이션
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => this.performUpdate(fiber),
          { timeout: priority * 100 });
      } else {
        setTimeout(() => this.performUpdate(fiber), 0);
      }
    }

    performUpdate(fiber) {
      // 실제 업데이트 수행
    }
  };

  /**
   * Diff 알고리즘 - 핵심 로직
   */
  diff(oldVNode, newVNode, parent = null) {
    // 1. 타입이 다른 경우
    if (!oldVNode || oldVNode.type !== newVNode.type) {
      return {
        type: 'REPLACE',
        oldVNode,
        newVNode,
        parent
      };
    }

    // 2. 텍스트 노드인 경우
    if (newVNode.type === 'TEXT_ELEMENT') {
      if (oldVNode.props.nodeValue !== newVNode.props.nodeValue) {
        return {
          type: 'UPDATE_TEXT',
          oldVNode,
          newVNode,
          parent
        };
      }
      return null;
    }

    // 3. 동일한 타입의 엘리먼트
    const patches = [];

    // Props diff
    const propsPatch = this.diffProps(oldVNode.props, newVNode.props);
    if (propsPatch) {
      patches.push({
        type: 'UPDATE_PROPS',
        oldVNode,
        newVNode,
        propsPatch,
        parent
      });
    }

    // Children diff (핵심 알고리즘)
    const childrenPatches = this.diffChildren(
      oldVNode.children,
      newVNode.children,
      newVNode
    );
    patches.push(...childrenPatches);

    return patches.length > 0 ? patches : null;
  }

  /**
   * Children Diff - 최적화된 리스트 조정 알고리즘
   */
  diffChildren(oldChildren, newChildren, parent) {
    const patches = [];
    const oldChildrenByKey = new Map();
    const newChildrenByKey = new Map();

    // 키가 있는 자식들 인덱싱
    oldChildren.forEach((child, index) => {
      if (child.key) {
        oldChildrenByKey.set(child.key, { child, index });
      }
    });

    newChildren.forEach((child, index) => {
      if (child.key) {
        newChildrenByKey.set(child.key, { child, index });
      }
    });

    // Two-pointer 알고리즘
    let oldStartIdx = 0;
    let oldEndIdx = oldChildren.length - 1;
    let newStartIdx = 0;
    let newEndIdx = newChildren.length - 1;

    let oldStartVNode = oldChildren[oldStartIdx];
    let oldEndVNode = oldChildren[oldEndIdx];
    let newStartVNode = newChildren[newStartIdx];
    let newEndVNode = newChildren[newEndIdx];

    while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
      if (!oldStartVNode) {
        oldStartVNode = oldChildren[++oldStartIdx];
      } else if (!oldEndVNode) {
        oldEndVNode = oldChildren[--oldEndIdx];
      } else if (this.isSameVNode(oldStartVNode, newStartVNode)) {
        // 시작 노드가 같은 경우
        const patch = this.diff(oldStartVNode, newStartVNode, parent);
        if (patch) patches.push(patch);
        oldStartVNode = oldChildren[++oldStartIdx];
        newStartVNode = newChildren[++newStartIdx];
      } else if (this.isSameVNode(oldEndVNode, newEndVNode)) {
        // 끝 노드가 같은 경우
        const patch = this.diff(oldEndVNode, newEndVNode, parent);
        if (patch) patches.push(patch);
        oldEndVNode = oldChildren[--oldEndIdx];
        newEndVNode = newChildren[--newEndIdx];
      } else if (this.isSameVNode(oldStartVNode, newEndVNode)) {
        // 시작 노드가 끝으로 이동
        const patch = this.diff(oldStartVNode, newEndVNode, parent);
        if (patch) patches.push(patch);
        patches.push({
          type: 'MOVE',
          from: oldStartIdx,
          to: newEndIdx,
          vNode: newEndVNode
        });
        oldStartVNode = oldChildren[++oldStartIdx];
        newEndVNode = newChildren[--newEndIdx];
      } else if (this.isSameVNode(oldEndVNode, newStartVNode)) {
        // 끝 노드가 시작으로 이동
        const patch = this.diff(oldEndVNode, newStartVNode, parent);
        if (patch) patches.push(patch);
        patches.push({
          type: 'MOVE',
          from: oldEndIdx,
          to: newStartIdx,
          vNode: newStartVNode
        });
        oldEndVNode = oldChildren[--oldEndIdx];
        newStartVNode = newChildren[++newStartIdx];
      } else {
        // 키를 사용한 매칭
        const idxInOld = oldChildrenByKey.get(newStartVNode.key);
        if (idxInOld) {
          const vnodeToMove = oldChildren[idxInOld.index];
          const patch = this.diff(vnodeToMove, newStartVNode, parent);
          if (patch) patches.push(patch);
          patches.push({
            type: 'MOVE',
            from: idxInOld.index,
            to: newStartIdx,
            vNode: newStartVNode
          });
          oldChildren[idxInOld.index] = undefined;
        } else {
          // 새로운 엘리먼트 추가
          patches.push({
            type: 'INSERT',
            index: newStartIdx,
            vNode: newStartVNode,
            parent
          });
        }
        newStartVNode = newChildren[++newStartIdx];
      }
    }

    // 남은 노드 처리
    if (oldStartIdx <= oldEndIdx) {
      for (let i = oldStartIdx; i <= oldEndIdx; i++) {
        if (oldChildren[i]) {
          patches.push({
            type: 'REMOVE',
            index: i,
            vNode: oldChildren[i]
          });
        }
      }
    }

    if (newStartIdx <= newEndIdx) {
      for (let i = newStartIdx; i <= newEndIdx; i++) {
        patches.push({
          type: 'INSERT',
          index: i,
          vNode: newChildren[i],
          parent
        });
      }
    }

    return patches;
  }

  /**
   * 같은 VNode인지 확인
   */
  isSameVNode(vNode1, vNode2) {
    return vNode1.key === vNode2.key && vNode1.type === vNode2.type;
  }

  /**
   * Props Diff
   */
  diffProps(oldProps, newProps) {
    const patches = {
      updates: {},
      removes: []
    };

    // 변경되거나 추가된 props
    for (const key in newProps) {
      if (key === 'children' || key === 'key' || key === 'ref') continue;

      if (oldProps[key] !== newProps[key]) {
        patches.updates[key] = newProps[key];
      }
    }

    // 제거된 props
    for (const key in oldProps) {
      if (key === 'children' || key === 'key' || key === 'ref') continue;

      if (!(key in newProps)) {
        patches.removes.push(key);
      }
    }

    return Object.keys(patches.updates).length > 0 || patches.removes.length > 0
      ? patches
      : null;
  }

  /**
   * 패치 적용
   */
  applyPatches(patches, domNode) {
    if (!patches) return;

    if (!Array.isArray(patches)) {
      patches = [patches];
    }

    patches.forEach(patch => {
      switch (patch.type) {
        case 'REPLACE':
          this.replaceNode(patch, domNode);
          break;
        case 'UPDATE_TEXT':
          this.updateText(patch, domNode);
          break;
        case 'UPDATE_PROPS':
          this.updateProps(patch, domNode);
          break;
        case 'INSERT':
          this.insertNode(patch, domNode);
          break;
        case 'REMOVE':
          this.removeNode(patch, domNode);
          break;
        case 'MOVE':
          this.moveNode(patch, domNode);
          break;
      }
    });
  }

  /**
   * DOM 노드 생성
   */
  createDOMNode(vNode) {
    if (vNode.type === 'TEXT_ELEMENT') {
      return document.createTextNode(vNode.props.nodeValue);
    }

    const domNode = document.createElement(vNode.type);

    // Props 적용
    this.setProps(domNode, vNode.props);

    // Children 추가
    vNode.children.forEach(child => {
      domNode.appendChild(this.createDOMNode(child));
    });

    // Ref 설정
    if (vNode.ref) {
      if (typeof vNode.ref === 'function') {
        vNode.ref(domNode);
      } else {
        vNode.ref.current = domNode;
      }
    }

    return domNode;
  }

  /**
   * Props 설정
   */
  setProps(domNode, props) {
    for (const key in props) {
      if (key === 'children' || key === 'key' || key === 'ref') continue;

      if (key === 'className') {
        domNode.className = props[key];
      } else if (key === 'style') {
        this.setStyles(domNode, props[key]);
      } else if (key.startsWith('on')) {
        const eventName = key.toLowerCase().substring(2);
        domNode.addEventListener(eventName, props[key]);
      } else if (key === 'dangerouslySetInnerHTML') {
        domNode.innerHTML = props[key].__html;
      } else {
        domNode.setAttribute(key, props[key]);
      }
    }
  }

  /**
   * 스타일 설정
   */
  setStyles(domNode, styles) {
    if (typeof styles === 'object') {
      for (const key in styles) {
        domNode.style[key] = styles[key];
      }
    } else {
      domNode.style = styles;
    }
  }

  /**
   * 노드 교체
   */
  replaceNode(patch, parentDOM) {
    const newDOM = this.createDOMNode(patch.newVNode);
    const oldDOM = this.findDOMNode(patch.oldVNode, parentDOM);
    if (oldDOM && oldDOM.parentNode) {
      oldDOM.parentNode.replaceChild(newDOM, oldDOM);
    }
  }

  /**
   * 텍스트 업데이트
   */
  updateText(patch, domNode) {
    domNode.nodeValue = patch.newVNode.props.nodeValue;
  }

  /**
   * Props 업데이트
   */
  updateProps(patch, domNode) {
    const node = this.findDOMNode(patch.oldVNode, domNode);
    if (!node) return;

    // Props 업데이트
    for (const key in patch.propsPatch.updates) {
      this.updateProp(node, key, patch.propsPatch.updates[key]);
    }

    // Props 제거
    patch.propsPatch.removes.forEach(key => {
      this.removeProp(node, key);
    });
  }

  /**
   * 개별 Prop 업데이트
   */
  updateProp(domNode, key, value) {
    if (key === 'className') {
      domNode.className = value;
    } else if (key === 'style') {
      this.setStyles(domNode, value);
    } else if (key.startsWith('on')) {
      // 이벤트 리스너 교체 (간단한 구현)
      const eventName = key.toLowerCase().substring(2);
      domNode.removeEventListener(eventName, domNode[`__${key}`]);
      domNode.addEventListener(eventName, value);
      domNode[`__${key}`] = value;
    } else {
      domNode.setAttribute(key, value);
    }
  }

  /**
   * Prop 제거
   */
  removeProp(domNode, key) {
    if (key === 'className') {
      domNode.className = '';
    } else if (key === 'style') {
      domNode.style = '';
    } else if (key.startsWith('on')) {
      const eventName = key.toLowerCase().substring(2);
      domNode.removeEventListener(eventName, domNode[`__${key}`]);
      delete domNode[`__${key}`];
    } else {
      domNode.removeAttribute(key);
    }
  }

  /**
   * 노드 삽입
   */
  insertNode(patch, parentDOM) {
    const newDOM = this.createDOMNode(patch.vNode);
    const parent = this.findDOMNode(patch.parent, parentDOM) || parentDOM;

    if (patch.index >= parent.children.length) {
      parent.appendChild(newDOM);
    } else {
      parent.insertBefore(newDOM, parent.children[patch.index]);
    }
  }

  /**
   * 노드 제거
   */
  removeNode(patch, parentDOM) {
    const node = this.findDOMNode(patch.vNode, parentDOM);
    if (node && node.parentNode) {
      node.parentNode.removeChild(node);
    }
  }

  /**
   * 노드 이동
   */
  moveNode(patch, parentDOM) {
    const node = this.findDOMNode(patch.vNode, parentDOM);
    const parent = node.parentNode;

    if (patch.to >= parent.children.length - 1) {
      parent.appendChild(node);
    } else {
      const referenceNode = parent.children[patch.to];
      parent.insertBefore(node, referenceNode);
    }
  }

  /**
   * DOM 노드 찾기
   */
  findDOMNode(vNode, parentDOM) {
    // 간단한 구현 - 실제로는 더 복잡한 매칭 로직 필요
    if (!parentDOM) return null;

    // VNode와 DOM 노드 매칭 로직
    // 여기서는 간단하게 인덱스 기반으로 찾기
    return parentDOM.children[0]; // 임시 구현
  }

  /**
   * 렌더링 엔트리 포인트
   */
  render(vNode, container) {
    if (!this.currentVTree) {
      // 초기 렌더링
      const domNode = this.createDOMNode(vNode);
      container.appendChild(domNode);
      this.currentVTree = vNode;
      this.rootElement = container;
    } else {
      // 리렌더링
      const patches = this.diff(this.currentVTree, vNode);
      this.applyPatches(patches, this.rootElement);
      this.currentVTree = vNode;
    }
  }

  /**
   * Hooks 구현 (간단한 버전)
   */
  static hooks = {
    currentComponent: null,
    currentHookIndex: 0,

    useState(initialValue) {
      const component = this.currentComponent;
      const hookIndex = this.currentHookIndex++;

      if (!component._hooks[hookIndex]) {
        component._hooks[hookIndex] = {
          state: initialValue,
          setState: (newState) => {
            component._hooks[hookIndex].state =
              typeof newState === 'function'
                ? newState(component._hooks[hookIndex].state)
                : newState;
            component.forceUpdate();
          }
        };
      }

      return [
        component._hooks[hookIndex].state,
        component._hooks[hookIndex].setState
      ];
    },

    useEffect(effect, deps) {
      const component = this.currentComponent;
      const hookIndex = this.currentHookIndex++;

      if (!component._hooks[hookIndex]) {
        component._hooks[hookIndex] = {
          effect,
          deps,
          cleanup: null
        };
      }

      const hook = component._hooks[hookIndex];
      const hasChanged = !deps || !hook.deps ||
        deps.some((dep, i) => dep !== hook.deps[i]);

      if (hasChanged) {
        if (hook.cleanup) hook.cleanup();
        hook.cleanup = effect();
        hook.deps = deps;
      }
    },

    useMemo(factory, deps) {
      const component = this.currentComponent;
      const hookIndex = this.currentHookIndex++;

      if (!component._hooks[hookIndex]) {
        component._hooks[hookIndex] = {
          value: factory(),
          deps
        };
      }

      const hook = component._hooks[hookIndex];
      const hasChanged = !deps || !hook.deps ||
        deps.some((dep, i) => dep !== hook.deps[i]);

      if (hasChanged) {
        hook.value = factory();
        hook.deps = deps;
      }

      return hook.value;
    },

    useCallback(callback, deps) {
      return this.useMemo(() => callback, deps);
    }
  };
}

// 사용 예제
function example() {
  const vdom = new VirtualDOM();

  // Virtual DOM 트리 생성
  const app = vdom.createElement('div', { className: 'app' },
    vdom.createElement('h1', null, 'Virtual DOM Example'),
    vdom.createElement('ul', null,
      vdom.createElement('li', { key: '1' }, 'Item 1'),
      vdom.createElement('li', { key: '2' }, 'Item 2'),
      vdom.createElement('li', { key: '3' }, 'Item 3')
    )
  );

  // 렌더링
  const container = document.getElementById('root');
  vdom.render(app, container);

  // 업데이트
  setTimeout(() => {
    const updatedApp = vdom.createElement('div', { className: 'app' },
      vdom.createElement('h1', null, 'Updated Virtual DOM'),
      vdom.createElement('ul', null,
        vdom.createElement('li', { key: '2' }, 'Item 2 Updated'),
        vdom.createElement('li', { key: '1' }, 'Item 1 Moved'),
        vdom.createElement('li', { key: '4' }, 'Item 4 New')
      )
    );
    vdom.render(updatedApp, container);
  }, 2000);
}

module.exports = VirtualDOM;