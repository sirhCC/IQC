/**
 * Mock for @kubernetes/client-node
 */

export class KubeConfig {
  loadFromDefault() {}
  loadFromFile(file: string) {}
  setCurrentContext(context: string) {}
  getCurrentContext() { return 'test-context'; }
  makeApiClient(api: any) { return {}; }
}

export class CoreV1Api {
  async listPodForAllNamespaces() {
    return { items: [] };
  }
  async listServiceForAllNamespaces() {
    return { items: [] };
  }
  async listNode() {
    return { items: [] };
  }
  async listNamespace() {
    return { items: [] };
  }
}

export class AppsV1Api {
  async listDeploymentForAllNamespaces() {
    return { items: [] };
  }
}
