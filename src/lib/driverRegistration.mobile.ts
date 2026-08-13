import { supabase } from "@/integrations/supabase/client";

const MAX_DOC_BYTES = 8 * 1024 * 1024;

type DriverDocument = {
  bucket: "driver-selfies" | "driver-cnh" | "vehicle-documents";
  label: "selfie" | "cnh" | "cnh_back" | "veiculo" | "vehicle_photo";
  fileName: string;
  contentType: string;
  base64: string;
};

export type DriverRegistrationInput = {
  name: string;
  email: string;
  phone: string;
  password: string;
  cpf: string;
  birth_date?: string | null;
  city: string;
  state: string;
  address: string;
  address_number: string;
  address_complement?: string | null;
  province: string;
  postal_code: string;
  declared_monthly_income: number;
  category: "carros" | "motos" | "fretes" | "guincho" | "envios";
  vehicle_model: string;
  vehicle_plate: string;
  vehicle_color: string;
  vehicle_year: number;
  documents: [DriverDocument, DriverDocument, DriverDocument, DriverDocument, DriverDocument];
};

function cleanExt(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
}

function decodeBase64(base64: string) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function readableAuthError(message: string) {
  if (/already|registered|exists|duplicate/i.test(message)) return "Este e-mail já está cadastrado.";
  if (/password/i.test(message)) return "Use uma senha com no mínimo 8 caracteres.";
  if (/email/i.test(message)) return "E-mail inválido.";
  return message || "Não foi possível criar a conta.";
}

async function ensureAuthenticatedAccount(input: DriverRegistrationInput) {
  const email = input.email.trim().toLowerCase();
  const signup = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      data: {
        role: "driver",
        name: input.name.trim(),
        full_name: input.name.trim(),
        phone: input.phone.trim(),
      },
    },
  });

  if (signup.error) {
    if (/already|registered|exists|duplicate/i.test(signup.error.message)) {
      const signIn = await supabase.auth.signInWithPassword({ email, password: input.password });
      if (signIn.error || !signIn.data.session || !signIn.data.user) {
        throw new Error("Este e-mail já está cadastrado. Entre com a senha correta para continuar o cadastro.");
      }
      return signIn.data.user;
    }
    throw new Error(readableAuthError(signup.error.message));
  }

  if (signup.data.session && signup.data.user) return signup.data.user;

  const signIn = await supabase.auth.signInWithPassword({ email, password: input.password });
  if (signIn.error || !signIn.data.session || !signIn.data.user) {
    throw new Error("Conta criada. Confirme seu e-mail e depois entre para concluir o cadastro.");
  }
  return signIn.data.user;
}

export async function cadastrarMotoristaMobile(input: DriverRegistrationInput) {
  const authUser = await ensureAuthenticatedAccount(input);
  const uploaded: Array<{ bucket: string; path: string }> = [];
  const paths: Partial<Record<DriverDocument["label"], string>> = {};
  let photoPath: string | null = null;

  try {
    for (const doc of input.documents) {
      const body = decodeBase64(doc.base64);
      if (!body.byteLength) throw new Error(`Arquivo vazio em ${doc.label}.`);
      if (body.byteLength > MAX_DOC_BYTES) throw new Error(`Arquivo de ${doc.label} excede 8 MB.`);

      const path = `${authUser.id}/${doc.label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${cleanExt(doc.fileName)}`;
      const { error } = await supabase.storage.from(doc.bucket).upload(path, body, {
        upsert: true,
        contentType: doc.contentType || "application/octet-stream",
      });
      if (error) throw new Error(`Falha no upload de ${doc.label}: ${error.message}`);
      uploaded.push({ bucket: doc.bucket, path });
      paths[doc.label] = path;

      if (doc.label === "selfie") {
        photoPath = `${authUser.id}/avatar-${Date.now()}.${cleanExt(doc.fileName)}`;
        const avatar = await supabase.storage.from("profile-photos").upload(photoPath, body, {
          upsert: true,
          contentType: doc.contentType || "image/jpeg",
        });
        if (avatar.error) throw new Error(`Falha ao salvar foto de perfil: ${avatar.error.message}`);
        uploaded.push({ bucket: "profile-photos", path: photoPath });
      }
    }

    if (!paths.selfie || !paths.cnh || !paths.cnh_back || !paths.veiculo || !paths.vehicle_photo) {
      throw new Error("Envie os documentos e a foto do veículo para concluir o cadastro.");
    }

    const { data, error } = await (supabase as any).rpc("driver_complete_registration_v3", {
      _name: input.name.trim(),
      _phone: input.phone.trim(),
      _cpf: input.cpf.trim(),
      _birth_date: input.birth_date || null,
      _city: input.city.trim(),
      _state: input.state.trim().toUpperCase(),
      _address: input.address.trim(),
      _address_number: input.address_number.trim(),
      _address_complement: input.address_complement?.trim() || null,
      _province: input.province.trim(),
      _postal_code: input.postal_code.replace(/\D/g, ""),
      _declared_monthly_income: Number(input.declared_monthly_income),
      _category: input.category,
      _vehicle_model: input.vehicle_model.trim(),
      _vehicle_plate: input.vehicle_plate.trim().toUpperCase(),
      _vehicle_color: input.vehicle_color.trim(),
      _vehicle_year: Number(input.vehicle_year),
      _selfie_path: paths.selfie,
      _cnh_path: paths.cnh,
      _cnh_back_path: paths.cnh_back,
      _vehicle_document_path: paths.veiculo,
      _vehicle_photo_path: paths.vehicle_photo,
      _photo_path: photoPath,
    });
    if (error) throw new Error(error.message || "Falha ao concluir cadastro de motorista.");

    return {
      ok: true as const,
      message: "Cadastro enviado com sucesso.",
      status: data?.approval_status ?? "em_analise",
    };
  } catch (error) {
    await Promise.allSettled(uploaded.map((item) => supabase.storage.from(item.bucket).remove([item.path])));
    throw error;
  }
}
