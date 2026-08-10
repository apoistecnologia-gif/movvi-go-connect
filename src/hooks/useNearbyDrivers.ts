export type RideCategory = "carros" | "motos" | "fretes" | "guincho" | "envios";

export type NearbyDriver = {
  user_id: string;
  name: string;
  category: RideCategory;
  current_lat: number;
  current_lng: number;
  vehicle_model: string;
  vehicle_color: string;
  rating: number;
};

type Filter = {
  category?: RideCategory;
};

const NO_PUBLIC_DRIVERS: NearbyDriver[] = [];

/**
 * A superfície Passageiro existente neste repositório não pode ler
 * `public.drivers` para desenhar veículos: essa tabela contém dados privados.
 *
 * O schema oficial também não possui hoje a antiga relação
 * `driver_public_locations`. Até existir um contrato público/coarse dedicado
 * no backend, retornamos uma lista vazia em vez de fazer uma consulta que
 * falha em runtime ou ampliar indevidamente o acesso a dados do motorista.
 *
 * O app Passageiro canônico vive em repositório próprio e deve consumir apenas
 * um endpoint/RPC de localização pública explicitamente autorizado.
 */
export function useNearbyDrivers(_filter: Filter = {}): NearbyDriver[] {
  return NO_PUBLIC_DRIVERS;
}
