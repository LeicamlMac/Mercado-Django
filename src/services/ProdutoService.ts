import { PrismaClient } from "@prisma/client/extension";
const prisma = new PrismaClient();

export class ProdutoService {
  async criarProduto(data: { nome: string; precoVenda: number; quantidadeEstoque: number; categoriaId: number }) {
      if (data.quantidadeEstoque < 0) {
        throw new Error('A quantidade em estoque deve ser um número inteiro positivo.');
      }
      const produto = await prisma.produto.create({ data: {
        nome: data.nome,
        precoVenda: data.precoVenda,
        quantidadeEstoque: data.quantidadeEstoque,
        categoriaId: data.categoriaId,
        },
      });
      return produto;
  }
  async listarProdutos() {
    return await prisma.produto.findMany({
      include: { categoria: true },
    });
  }
}