import { PrismaClient } from "@prisma/client/extension";
import { create } from "node:domain";
const prisma = new PrismaClient();

export class VendaService {
    async registrarVenda(itens: { produtoId: number; quantidade: number }[]) {
        return await prisma.$transaction(async (tx) => {
            let valorTotalVenda = 0;
            const itensParaSalvar = [];

            for (const item of itens) {
                const produto = await tx.produto.findUnique({ whhere: { id: item.produtoId } });
                if (item.quantidade > produto.quantidadeEstoque) {
                    throw new Error(`Estoque insuficiente para o produto ${produto.nome}.`);
                }

                const subtotal = Number(produto.precoVenda) * item.quantidade;
                valorTotalVenda += subtotal;

                itensParaSalvar.push({
                    produtoId: produto.id,
                    quantidade: item.quantidade,
                    precoUnitario: produto.precoVenda
                });

                await tx.produto.update({
                    where: { id: produto.id },
                    data: { quantidadeEstoque: { decrement: item.quantidade } }
                });
            }

            const novaVenda = await tx.venda.create({
                data: {
                    valorTotal: valorTotalVenda,
                    itens: { create: itensParaSalvar }
                },
                include: { itens: true }
            });
            return novaVenda;
        });
    }
}