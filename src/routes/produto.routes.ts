import { Router } from "express";
import { ProdutoController } from "../controllers/ProdutoController";

const router = Router();
const produtoController = new ProdutoController();

router.post("/produtos", produtoController.criarProduto);
router.get("/produtos", produtoController.listarProdutos);

export default router;