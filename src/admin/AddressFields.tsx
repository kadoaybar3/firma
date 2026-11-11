import { useId, useMemo, useState } from "react";
import { Field } from "../components/ui";
import LocationSelect from "../components/LocationSelect";
import { TR_ILLER } from "../data/trCities";
import { TR_MAHALLELERI } from "../data/trNeighborhoods";
import {
  EMPTY_ADDRESS_PARTS,
  addressSuggestions,
  composeAddress,
  parseAddress,
  type AddressParts,
} from "../lib/address";
import { normalizeSearch } from "../lib/slug";
import type { City, Company } from "../lib/types";

export interface AddressSelection {
  cityId: string;
  district: string;
  address: string;
  province: string;
}

/**
 * Türkiye adres sırası: İl → İlçe → Mahalle → Cadde/Sokak → Bina no → Detay.
 * İl/ilçe DB `cities` kayıtlarıyla eşlenir. Afyonkarahisar mahalleleri
 * turkiye-api 2025 verisinden; diğer illerde mahalle/cadde önerileri mevcut
 * firma adreslerinden türetilir. Kullanıcı her durumda elle de yazabilir.
 */
export function AddressFields({
  cities,
  companies,
  initialCityId,
  initialDistrict,
  initialAddress,
  fieldErrors,
  onChange,
}: {
  cities: City[];
  companies: Array<Pick<Company, "cityId" | "district" | "address">>;
  initialCityId: string;
  initialDistrict: string;
  initialAddress: string;
  fieldErrors?: { cityId?: string; district?: string };
  onChange: (next: AddressSelection) => void;
}) {
  const initialCity = cities.find((city) => city.id === initialCityId);
  const [province, setProvince] = useState(() => {
    const initialName = initialCity?.name ?? "";
    return TR_ILLER.find((name) => normalizeSearch(name) === normalizeSearch(initialName)) ?? initialName;
  });
  const [cityId, setCityId] = useState(initialCityId);
  const [district, setDistrict] = useState(initialDistrict);
  const [parts, setParts] = useState<AddressParts>(() =>
    initialAddress.trim()
      ? parseAddress(initialAddress, initialDistrict, initialCity?.name ?? "")
      : EMPTY_ADDRESS_PARTS,
  );
  /** Adres alanlarına dokunulmadıysa mevcut `address` metni aynen korunur. */
  const [touched, setTouched] = useState(false);

  const listId = useId();
  const neighborhoodListId = `${listId}-mahalle`;
  const streetListId = `${listId}-cadde`;

  const dbCity = cities.find((city) => normalizeSearch(city.name) === normalizeSearch(province));

  const extraProvinces =
    province && !TR_ILLER.some((name) => normalizeSearch(name) === normalizeSearch(province))
      ? [province]
      : [];

  /** Seçili ile ait eski/özel ilçeler kaybolmasın diye statik listeye eklenir. */
  const extraDistricts = dbCity?.districts ?? [];

  const suggestions = useMemo(
    () =>
      addressSuggestions(
        companies,
        dbCity?.id ?? cityId,
        district,
        province,
        parts.neighborhood,
      ),
    [companies, dbCity?.id, cityId, district, province, parts.neighborhood],
  );
  const officialNeighborhoods = useMemo(() => {
    const provinceMap = TR_MAHALLELERI[province];
    if (!provinceMap) return [];
    const districtKey = Object.keys(provinceMap).find(
      (name) => normalizeSearch(name) === normalizeSearch(district),
    );
    return districtKey
      ? [...provinceMap[districtKey]].sort((a, b) => a.localeCompare(b, "tr"))
      : [];
  }, [province, district]);
  /** Resmî liste varsa yalnız onu göster; yoksa mevcut adreslerden türetilenler. */
  const neighborhoodOptions = officialNeighborhoods.length
    ? officialNeighborhoods
    : suggestions.neighborhoods;

  const streetOptions =
    parts.neighborhood && suggestions.streets.length ? suggestions.streets : suggestions.allStreets;
  const composedAddress = composeAddress(parts, district, province);

  function emit(nextProvince: string, nextCityId: string, nextDistrict: string, nextParts: AddressParts) {
    setTouched(true);
    onChange({
      cityId: nextCityId,
      district: nextDistrict,
      address: composeAddress(nextParts, nextDistrict, nextProvince),
      province: nextProvince,
    });
  }

  function changeProvince(value: string) {
    const nextCity = cities.find((city) => normalizeSearch(city.name) === normalizeSearch(value));
    const nextCityId = nextCity?.id ?? "";
    setProvince(value);
    setCityId(nextCityId);
    setDistrict("");
    setParts(EMPTY_ADDRESS_PARTS);
    emit(value, nextCityId, "", EMPTY_ADDRESS_PARTS);
  }

  function changeDistrict(value: string) {
    // İlçe değişince mahalle/cadde/kapı bilgileri eski adrese ait kalır; temizle.
    const nextParts = EMPTY_ADDRESS_PARTS;
    setDistrict(value);
    setParts(nextParts);
    emit(province, cityId, value, nextParts);
  }

  function changePart(key: keyof AddressParts, value: string) {
    const nextParts = { ...parts, [key]: value };
    setParts(nextParts);
    emit(province, cityId, district, nextParts);
  }

  const detailsDisabled = !province || !district;

  return (
    <>
      <LocationSelect
        className="address-location"
        value={{ province, district }}
        onChange={(next) => {
          if (next.province !== province) {
            changeProvince(next.province);
            return;
          }
          if (next.district !== district) changeDistrict(next.district);
        }}
        required
        extraProvinces={extraProvinces}
        extraDistricts={extraDistricts}
        errorProvince={fieldErrors?.cityId}
        errorDistrict={fieldErrors?.district}
      />

      <Field label="Mahalle" hint="Listeden seçin veya elle yazın.">
        <input
          list={neighborhoodListId}
          value={parts.neighborhood}
          onChange={(event) => changePart("neighborhood", event.target.value)}
          placeholder="Mahalle adı"
          autoComplete="off"
          disabled={!province || !district}
        />
        <datalist id={neighborhoodListId}>
          {neighborhoodOptions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </Field>

      <Field label="Cadde / Sokak" hint="Listeden seçin veya elle yazın.">
        <input
          list={streetListId}
          value={parts.street}
          onChange={(event) => changePart("street", event.target.value)}
          placeholder="Cadde veya sokak adı"
          autoComplete="off"
          disabled={!province || !district}
        />
        <datalist id={streetListId}>
          {streetOptions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </Field>

      <Field label="Bina / Kapı numarası">
        <input
          value={parts.buildingNo}
          onChange={(event) => changePart("buildingNo", event.target.value)}
          placeholder="Örn. 41"
          autoComplete="off"
          disabled={detailsDisabled}
        />
      </Field>

      <div style={{ gridColumn: "1 / -1" }}>
        <Field label="Adres detayları">
          <textarea
            rows={2}
            value={parts.details}
            onChange={(event) => changePart("details", event.target.value)}
            placeholder="Kat, daire, blok, tarif…"
            disabled={detailsDisabled}
          />
        </Field>
      </div>

      {initialAddress.trim() && !touched && (
        <p className="text-muted small" style={{ gridColumn: "1 / -1", margin: "0 0 14px" }}>
          Mevcut adres korunuyor: {initialAddress.trim()}
        </p>
      )}
      {touched && composedAddress && (
        <p className="text-muted small" style={{ gridColumn: "1 / -1", margin: "0 0 14px" }}>
          Kaydedilecek adres: {composedAddress}
        </p>
      )}
    </>
  );
}
