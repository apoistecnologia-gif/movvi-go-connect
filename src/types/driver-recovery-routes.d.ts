import "@tanstack/react-router";

declare module "@tanstack/react-router" {
  interface FileRoutesByPath {
    "/motorista/recuperar-senha": {
      id: "/motorista/recuperar-senha";
      path: "/motorista/recuperar-senha";
      fullPath: "/motorista/recuperar-senha";
      preLoaderRoute: any;
      parentRoute: any;
    };
    "/motorista/redefinir-senha": {
      id: "/motorista/redefinir-senha";
      path: "/motorista/redefinir-senha";
      fullPath: "/motorista/redefinir-senha";
      preLoaderRoute: any;
      parentRoute: any;
    };
  }
}

export {};
