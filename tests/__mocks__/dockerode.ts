/**
 * Mock for dockerode
 */

class Docker {
  constructor(options?: any) {}
  
  async ping() {
    return {};
  }
  
  async listContainers(options?: any) {
    return [];
  }
  
  async listImages(options?: any) {
    return [];
  }
  
  async listVolumes() {
    return { Volumes: [] };
  }
  
  async listNetworks() {
    return [];
  }
}

export = Docker;
