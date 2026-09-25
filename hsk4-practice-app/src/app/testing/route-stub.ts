import { convertToParamMap } from '@angular/router';
import { of } from 'rxjs';

/**
 * Minimal `ActivatedRoute` stand-in for specs that create a routed component
 * directly with `TestBed.createComponent`.
 *
 * Creating the component through the router instead would instantiate a second
 * copy (and fire a second set of HTTP requests), so specs inject these params
 * explicitly and stub `Router.navigate` to assert where the component wanted
 * to go.
 */
export function routeStub(params: Record<string, string>) {
  const paramMap = convertToParamMap(params);
  return {
    snapshot: { paramMap, params },
    paramMap: of(paramMap),
    params: of(params),
    queryParamMap: of(convertToParamMap({})),
  };
}
