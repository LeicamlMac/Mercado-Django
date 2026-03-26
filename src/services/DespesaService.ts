import { PrismaClient, TipoDespesa, StatusDespesa } from "@prisma/client";

const prisma = new PrismaClient();

export class DespesaService {
    async registrarDespesa (data: { descricao: string; valor: number; tipo: TipoDespesa; status: StatusDespesa }) {
        return await prisma.despesa.create({ data });
    }

    async listarDespesas() {
        return await prisma.despesa.findMany();
    }
}