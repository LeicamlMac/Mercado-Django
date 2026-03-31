from decimal import Decimal
import re

from django.core.management.base import BaseCommand
from django.db.models import Q

from api.models import (
    Category,
    Department,
    ProductBase,
    ProductPackage,
    ProductVariant,
    StockMovement,
)
from api.services.local_catalog import LOCAL_CATALOG_ITEMS
from api.services.taxonomy import resolve_category_name


class Command(BaseCommand):
    help = "Seed a large and realistic atacarejo-style catalog for local development."
    TARGET_VARIANTS = 6000
    LEGACY_PRODUCT_RENAMES = (
        ("Bovina", "Carne Bovina"),
        ("Suina", "Carne Suina"),
        ("Pasta de Dente", "Creme Dental"),
    )
    INVALID_REFRI_BY_BRAND = {
        "coca": {"guarana", "laranja", "limao", "uva"},
        "pepsi": {"guarana", "laranja", "limao", "uva"},
        "guarana antarctica": {"cola", "laranja", "limao", "uva"},
        "kuat": {"cola", "laranja", "limao", "uva"},
    }

    FAMILY_SPECS = [
        {
            "departments": ["Mercearia"],
            "product": "Arroz",
            "brands": ["Camil", "Tio Joao", "Kicaldo", "Prato Fino", "Namorado", "Broto Legal", "Pacha"],
            "variants": ["Branco", "Parboilizado"],
            "sizes": ["1KG", "2KG", "5KG", "10KG"],
        },
        {
            "departments": ["Mercearia"],
            "product": "Feijao",
            "brands": ["Kicaldo", "Camil", "Caldo Bom", "Namorado", "Urbano", "Broto Legal"],
            "variants": ["Carioca", "Preto", "Branco", "Feijao-de-corda", "Rajado", "Vermelho"],
            "sizes": ["500G", "1KG", "2KG", "5KG"],
        },
        {
            "departments": ["Mercearia"],
            "product": "Macarrao",
            "brands": ["Renata", "Adria", "Galo", "Barilla", "Isabela", "Vilma"],
            "variants": ["Espaguete", "Parafuso", "Penne", "Talharim", "Ave Maria", "Ninho", "Integral"],
            "sizes": ["500G", "1KG", "2KG"],
        },
        {
            "departments": ["Mercearia"],
            "product": "Acucar",
            "brands": ["Uniao", "Caravelas", "Guarani", "Alto Alegre", "Da Barra"],
            "variants": ["Cristal", "Refinado", "Mascavo", "Demerara"],
            "sizes": ["1KG", "2KG", "5KG"],
        },
        {
            "departments": ["Mercearia"],
            "product": "Cafe",
            "brands": ["Pilao", "3 Coracoes", "Melitta", "Caboclo", "Santa Clara", "Lor", "Nescafe"],
            "variants": ["Tradicional", "Forte", "Extra Forte", "Descafeinado"],
            "sizes": ["250G", "500G", "1KG"],
        },
        {
            "departments": ["Bebidas"],
            "product": "Refrigerante",
            "brands": ["Coca-Cola", "Guarana Antarctica", "Fanta", "Pepsi", "Sprite", "Kuat", "Dolly"],
            "variants": ["Cola", "Guarana", "Laranja", "Limao", "Uva", "Zero", "Sem Acucar"],
            "brand_variants": {
                "Coca-Cola": ["Cola", "Zero", "Sem Acucar"],
                "Pepsi": ["Cola", "Zero", "Sem Acucar"],
                "Guarana Antarctica": ["Guarana", "Zero", "Sem Acucar"],
                "Kuat": ["Guarana", "Zero", "Sem Acucar"],
                "Sprite": ["Limao", "Zero", "Sem Acucar"],
                "Fanta": ["Laranja", "Uva", "Limao", "Zero"],
                "Dolly": ["Cola", "Guarana", "Laranja", "Uva", "Zero"],
            },
            "sizes": ["200ML", "350ML", "600ML", "1L", "1.5L", "2L", "3L"],
        },
        {
            "departments": ["Bebidas"],
            "product": "Suco",
            "brands": ["Del Valle", "Maguary", "Tial", "Natural One", "Do Bem", "Sufresh"],
            "variants": [
                "Uva",
                "Laranja",
                "Manga",
                "Maracuja",
                "Abacaxi",
                "Caju",
                "Goiaba",
                "Limao",
                "Pessego",
                "Frutas Vermelhas",
            ],
            "sizes": ["200ML", "300ML", "1L", "1.5L", "2L"],
        },
        {
            "departments": ["Bebidas"],
            "product": "Agua",
            "brands": ["Crystal", "Minalba", "Bonafont", "Indaia", "Lindoya"],
            "variants": ["Sem Gas", "Com Gas", "Saborizada"],
            "sizes": ["350ML", "500ML", "1L", "1.5L", "5L"],
        },
        {
            "departments": ["Laticinios", "Bebidas"],
            "product": "Leite",
            "brands": ["Italac", "Piracanjuba", "Elegê", "Nestle", "Parmalat", "Ninho"],
            "variants": ["Integral", "Desnatado", "Semidesnatado", "Zero Lactose"],
            "sizes": ["200ML", "1L", "2L"],
        },
        {
            "departments": ["Laticinios"],
            "product": "Iogurte",
            "brands": ["Vigor", "Nestle", "Danone", "Batavo", "Itambe"],
            "variants": ["Natural", "Morango", "Coco", "Grego", "Desnatado", "Zero Lactose"],
            "sizes": ["170G", "500G", "1KG"],
        },
        {
            "departments": ["Higiene", "Higiene Pessoal"],
            "product": "Creme Dental",
            "brands": ["Colgate", "Sorriso", "Oral-B", "Closeup", "Sensodyne", "Elmex"],
            "variants": ["Anticaries", "Branqueadora", "Sensibilidade", "Menta", "Infantil"],
            "sizes": ["70G", "90G", "120G"],
        },
        {
            "departments": ["Higiene", "Higiene Pessoal"],
            "product": "Escova de Dente",
            "brands": ["Colgate", "Oral-B", "Sorriso", "Condor", "Curaprox"],
            "variants": ["Macia", "Media", "Dura", "Infantil"],
            "sizes": ["1UN", "2UN", "4UN"],
        },
        {
            "departments": ["Higiene", "Higiene Pessoal"],
            "product": "Papel Higienico",
            "brands": ["Neve", "Personal", "Mili", "Duetto", "Cotton", "Sublime"],
            "variants": ["Folha Simples", "Folha Dupla", "Folha Tripla"],
            "sizes": ["4UN", "8UN", "12UN", "16UN", "24UN"],
        },
        {
            "departments": ["Higiene", "Higiene Pessoal"],
            "product": "Sabonete",
            "brands": ["Dove", "Lux", "Palmolive", "Nivea", "Protex", "Francis"],
            "variants": ["Em Barra", "Liquido", "Hidratante", "Antibacteriano"],
            "sizes": ["85G", "90G", "250ML", "500ML"],
        },
        {
            "departments": ["Higiene", "Higiene Pessoal"],
            "product": "Shampoo",
            "brands": ["Pantene", "Seda", "Elseve", "Head & Shoulders", "Dove", "Tresemme"],
            "variants": ["Hidratacao", "Anticaspa", "Reconstrucao", "Infantil", "Liso"],
            "sizes": ["200ML", "350ML", "400ML", "700ML"],
        },
        {
            "departments": ["Higiene", "Higiene Pessoal"],
            "product": "Desodorante",
            "brands": ["Rexona", "Nivea", "Dove", "Gillette", "Monange", "Bozzano"],
            "variants": ["Aerosol", "Roll-On", "Creme", "Sem Perfume"],
            "sizes": ["50ML", "90G", "150ML"],
        },
        {
            "departments": ["Limpeza"],
            "product": "Detergente",
            "brands": ["Ype", "Limpol", "Minuano", "Brilhus", "Ipê"],
            "variants": ["Neutro", "Limao", "Coco", "Maça"],
            "sizes": ["500ML", "1L", "2L"],
        },
        {
            "departments": ["Limpeza"],
            "product": "Sabao em Po",
            "brands": ["Omo", "Brilhante", "Tixan", "Surf", "Ype", "Urca"],
            "variants": ["Tradicional", "Lavanda", "Aroma Suave", "Concentrado"],
            "sizes": ["800G", "1KG", "2KG", "5KG"],
        },
        {
            "departments": ["Limpeza"],
            "product": "Desinfetante",
            "brands": ["Veja", "Pinho Sol", "Lysoform", "Uau", "Casa & Perfume"],
            "variants": ["Lavanda", "Floral", "Eucalipto", "Marine"],
            "sizes": ["500ML", "1L", "2L", "5L"],
        },
        {
            "departments": ["Limpeza"],
            "product": "Agua Sanitaria",
            "brands": ["Qboa", "Ype", "Brilux", "Candura", "Super Cândida"],
            "variants": ["Tradicional", "Perfumada", "Sem Cloro"],
            "sizes": ["1L", "2L", "5L"],
        },
        {
            "departments": ["Carnes"],
            "product": "Frango",
            "brands": ["Sadia", "Perdigao", "Seara", "Aurora", "Copacol"],
            "variants": [
                "Peito",
                "Coxa",
                "Sobrecoxa",
                "Asa",
                "File",
                "Filezinho",
                "Coracao",
                "Moela",
                "Inteiro",
            ],
            "sizes": ["1KG", "2KG", "5KG"],
        },
        {
            "departments": ["Carnes"],
            "product": "Carne Bovina",
            "brands": ["Friboi", "Minerva", "Maturatta", "Swift", "Seara"],
            "variants": [
                "Acem",
                "Patinho",
                "Alcatra",
                "Picanha",
                "Musculo",
                "Coxao Mole",
                "Coxao Duro",
                "Fraldinha",
                "Costela",
                "Maminha",
                "Contra File",
                "File Mignon",
                "Cupim",
                "Lagarto",
                "Paleta",
                "Peito",
            ],
            "sizes": ["500G", "1KG", "2KG", "5KG"],
        },
        {
            "departments": ["Carnes"],
            "product": "Carne Suina",
            "brands": ["Sadia", "Perdigao", "Seara", "Aurora", "Frimesa"],
            "variants": [
                "Lombo",
                "Pernil",
                "Costela",
                "Bisteca",
                "Copa Lombo",
                "Barriga",
                "Panceta",
                "File Mignon Suino",
                "Paleta",
            ],
            "sizes": ["500G", "1KG", "2KG", "5KG"],
        },
        {
            "departments": ["Carnes"],
            "product": "Linguica",
            "brands": ["Perdigao", "Sadia", "Seara", "Aurora", "Frimesa"],
            "variants": ["Toscana", "Calabresa", "Frango", "Defumada"],
            "sizes": ["400G", "1KG", "2KG"],
        },
        {
            "departments": ["Congelados"],
            "product": "Pizza Congelada",
            "brands": ["Sadia", "Seara", "Perdigao", "Swift", "Mr. Bey"],
            "variants": [
                "Calabresa",
                "Mussarela",
                "Portuguesa",
                "Frango Catupiry",
                "Quatro Queijos",
                "Pepperoni",
                "Atum",
            ],
            "sizes": ["350G", "460G", "500G", "650G", "1KG"],
        },
        {
            "departments": ["Congelados"],
            "product": "Polpa de Fruta",
            "brands": ["Brasfrut", "De Marchi", "Mais Fruta", "Fruta Polpa", "Da Fruta"],
            "variants": [
                "Acerola",
                "Caju",
                "Manga",
                "Abacaxi",
                "Maracuja",
                "Goiaba",
                "Graviola",
                "Cupuacu",
                "Morango",
                "Caja",
                "Uva",
                "Limao",
                "Tamarindo",
                "Umbu",
                "Pitanga",
                "Frutas Vermelhas",
            ],
            "sizes": ["100G", "400G", "1KG"],
        },
        {
            "departments": ["Mercearia"],
            "product": "Biscoito",
            "brands": ["Vitarella", "Marilan", "Bauducco", "Mabel", "Piraque", "Richester"],
            "variants": ["Cream Cracker", "Maisena", "Integral", "Leite", "Chocolate", "Recheado"],
            "sizes": ["120G", "200G", "350G", "400G"],
        },
        {
            "departments": ["Mercearia"],
            "product": "Farinha de Trigo",
            "brands": ["Dona Benta", "Rosa Branca", "Anaconda", "Lili", "Boa Sorte"],
            "variants": ["Tradicional", "Com Fermento", "Sem Fermento", "Integral"],
            "sizes": ["1KG", "5KG"],
        },
        {
            "departments": ["Mercearia"],
            "product": "Molho de Tomate",
            "brands": ["Quero", "Fugini", "Elefante", "Pomarola", "Predilecta"],
            "variants": ["Tradicional", "Manjericao", "Pizza", "Bolonhesa", "Sugo"],
            "sizes": ["300G", "340G", "520G", "1KG"],
        },
        {
            "departments": ["Mercearia"],
            "product": "Extrato de Tomate",
            "brands": ["Elefante", "Quero", "Fugini", "Predilecta"],
            "variants": ["Tradicional", "Refogado", "Sem Conservantes"],
            "sizes": ["130G", "300G", "340G", "1KG"],
        },
        {
            "departments": ["Mercearia"],
            "product": "Tempero Pronto",
            "brands": ["Sazon", "Arisco", "Kitano", "Knorr", "Sinha"],
            "variants": ["Alho e Sal", "Carne", "Frango", "Legumes", "Baiano"],
            "sizes": ["60G", "100G", "300G", "1KG"],
        },
        {
            "departments": ["Mercearia"],
            "product": "Achocolatado",
            "brands": ["Nescau", "Toddy", "Italac", "3 Coracoes", "Apti"],
            "variants": ["Tradicional", "Light", "Zero Acucar"],
            "sizes": ["200G", "400G", "700G", "1KG"],
        },
        {
            "departments": ["Mercearia"],
            "product": "Ovos",
            "brands": ["Mantiqueira", "Yabuta", "Avine", "Granja Faria", "Korin"],
            "variants": ["Branco", "Vermelho", "Caipira", "Jumbo"],
            "sizes": ["6UN", "12UN", "20UN", "30UN"],
        },
        {
            "departments": ["Laticinios"],
            "product": "Manteiga",
            "brands": ["Itambe", "Aviacao", "Vigor", "President", "Elegue"],
            "variants": ["Com Sal", "Sem Sal", "Extra"],
            "sizes": ["200G", "500G"],
        },
        {
            "departments": ["Laticinios"],
            "product": "Margarina",
            "brands": ["Qualy", "Delicia", "Claybom", "Doriana", "Becel"],
            "variants": ["Com Sal", "Sem Sal", "Light"],
            "sizes": ["250G", "500G", "1KG"],
        },
        {
            "departments": ["Laticinios"],
            "product": "Requeijao",
            "brands": ["Catupiry", "Vigor", "Italac", "Polenghi", "Tirolez"],
            "variants": ["Tradicional", "Light", "Cheddar", "Zero Lactose"],
            "sizes": ["180G", "200G", "400G"],
        },
        {
            "departments": ["Frios"],
            "product": "Presunto",
            "brands": ["Sadia", "Perdigao", "Seara", "Aurora", "Frimesa"],
            "variants": ["Fatiado", "Cozido", "Defumado", "Light"],
            "sizes": ["100G", "200G", "500G", "1KG"],
        },
        {
            "departments": ["Frios"],
            "product": "Mussarela Fatiada",
            "brands": ["Sadia", "Tirolez", "Polenghi", "Italac", "Vigor"],
            "variants": ["Tradicional", "Light", "Lanche"],
            "sizes": ["150G", "200G", "500G", "1KG"],
        },
        {
            "departments": ["Padaria"],
            "product": "Pao de Forma",
            "brands": ["Pullman", "Wickbold", "Seven Boys", "Bauducco", "Visconti"],
            "variants": ["Tradicional", "Integral", "Multigraos", "Zero Acucar"],
            "sizes": ["400G", "500G", "600G"],
        },
        {
            "departments": ["Padaria"],
            "product": "Bolo Pronto",
            "brands": ["Bauducco", "Panco", "Ana Maria", "Visconti", "Casa Suica"],
            "variants": ["Chocolate", "Cenoura", "Laranja", "Fuba", "Milho"],
            "sizes": ["250G", "400G", "500G", "1KG"],
        },
        {
            "departments": ["Limpeza"],
            "product": "Amaciante",
            "brands": ["Ype", "Comfort", "Fofo", "Urca", "Baby Soft"],
            "variants": ["Tradicional", "Lavanda", "Floral", "Intense"],
            "sizes": ["500ML", "1L", "2L", "5L"],
        },
        {
            "departments": ["Limpeza"],
            "product": "Limpador Multiuso",
            "brands": ["Veja", "Uau", "Ype", "Mr Musculo", "Casa & Perfume"],
            "variants": ["Tradicional", "Lavanda", "Limao", "Desengordurante"],
            "sizes": ["500ML", "750ML", "1L"],
        },
        {
            "departments": ["Limpeza"],
            "product": "Esponja Multiuso",
            "brands": ["Scotch-Brite", "Ype", "Bombril", "Assolan", "Bettanin"],
            "variants": ["Dupla Face", "Antirrisco", "Tradicional"],
            "sizes": ["1UN", "3UN", "4UN", "8UN"],
        },
        {
            "departments": ["Limpeza"],
            "product": "Papel Toalha",
            "brands": ["Snob", "Kitchen", "Neve", "Mili", "Scala"],
            "variants": ["Folha Simples", "Folha Dupla", "Folha Tripla"],
            "sizes": ["1UN", "2UN", "3UN", "6UN"],
        },
        {
            "departments": ["Hortifruti"],
            "product": "Banana",
            "brands": ["Hortifruti"],
            "variants": ["Nanica", "Prata", "Maca", "Da Terra"],
            "sizes": ["500G", "1KG", "2KG", "1UN"],
        },
        {
            "departments": ["Hortifruti"],
            "product": "Limao",
            "brands": ["Hortifruti"],
            "variants": ["Taiti", "Siciliano", "Galego"],
            "sizes": ["500G", "1KG", "2KG"],
        },
        {
            "departments": ["Hortifruti"],
            "product": "Laranja",
            "brands": ["Hortifruti"],
            "variants": ["Pera", "Lima", "Bahia"],
            "sizes": ["500G", "1KG", "2KG", "5KG"],
        },
        {
            "departments": ["Hortifruti"],
            "product": "Maca",
            "brands": ["Hortifruti"],
            "variants": ["Gala", "Fuji", "Verde"],
            "sizes": ["500G", "1KG", "2KG"],
        },
        {
            "departments": ["Hortifruti"],
            "product": "Tomate",
            "brands": ["Hortifruti"],
            "variants": ["Salada", "Italiano", "Cereja"],
            "sizes": ["500G", "1KG", "2KG"],
        },
        {
            "departments": ["Hortifruti"],
            "product": "Batata",
            "brands": ["Hortifruti"],
            "variants": ["In Natura", "Asterix", "Monalisa"],
            "sizes": ["500G", "1KG", "2KG", "5KG"],
        },
        {
            "departments": ["Hortifruti"],
            "product": "Cebola",
            "brands": ["Hortifruti"],
            "variants": ["Branca", "Roxa", "Perola"],
            "sizes": ["500G", "1KG", "2KG", "5KG"],
        },
        {
            "departments": ["Hortifruti"],
            "product": "Alho",
            "brands": ["Hortifruti"],
            "variants": ["Nacional", "Importado", "Descascado"],
            "sizes": ["100G", "200G", "500G", "1KG"],
        },
        {
            "departments": ["Hortifruti"],
            "product": "Cenoura",
            "brands": ["Hortifruti"],
            "variants": ["In Natura", "Baby"],
            "sizes": ["500G", "1KG", "2KG"],
        },
    ]

    BASE_CATALOG = [
        {
            "category": "Arroz",
            "product": "Arroz",
            "brand": "Tio Joao",
            "variant": "Branco",
            "size": "1KG",
            "price": Decimal("7.99"),
            "stock_units": 42,
            "packages": [("UNIDADE", 1), ("FARDO", 30)],
            "departments": ["Mercearia"],
        },
        {
            "category": "Leite",
            "product": "Leite",
            "brand": "Italac",
            "variant": "Integral",
            "size": "1L",
            "price": Decimal("5.89"),
            "stock_units": 36,
            "packages": [("UNIDADE", 1), ("CAIXA", 12)],
            "departments": ["Laticinios", "Bebidas"],
        },
        {
            "category": "Refrigerante",
            "product": "Refrigerante",
            "brand": "Coca-Cola",
            "variant": "Cola",
            "size": "2L",
            "price": Decimal("10.99"),
            "stock_units": 24,
            "packages": [("UNIDADE", 1), ("FARDO", 6)],
            "departments": ["Bebidas"],
        },
        {
            "category": "Papel Higienico",
            "product": "Papel Higienico",
            "brand": "Neve",
            "variant": "Folha Dupla",
            "size": "12UN",
            "price": Decimal("21.90"),
            "stock_units": 40,
            "packages": [("UNIDADE", 1), ("FARDO", 8)],
            "departments": ["Higiene", "Higiene Pessoal"],
        },
        {
            "category": "Creme Dental",
            "product": "Creme Dental",
            "brand": "Colgate",
            "variant": "Anticaries",
            "size": "90G",
            "price": Decimal("6.90"),
            "stock_units": 52,
            "packages": [("UNIDADE", 1), ("CAIXA", 12)],
            "departments": ["Higiene", "Higiene Pessoal"],
        },
    ]

    def _key(self, item):
        return (
            (item.get("product") or "").strip().lower(),
            (item.get("brand") or "").strip().lower(),
            (item.get("variant") or "").strip().lower(),
            (item.get("size") or "").strip().lower(),
        )

    def _infer_price(self, size):
        text = (size or "").strip().upper()

        kg = re.search(r"(\d+(?:\.\d+)?)\s*KG$", text)
        if kg:
            value = Decimal(kg.group(1))
            return (value * Decimal("6.40") + Decimal("2.50")).quantize(Decimal("0.01"))

        grams = re.search(r"(\d+(?:\.\d+)?)\s*G$", text)
        if grams:
            value = Decimal(grams.group(1)) / Decimal("1000")
            return (value * Decimal("8.10") + Decimal("2.10")).quantize(Decimal("0.01"))

        liters = re.search(r"(\d+(?:\.\d+)?)\s*L$", text)
        if liters:
            value = Decimal(liters.group(1))
            return (value * Decimal("5.30") + Decimal("1.90")).quantize(Decimal("0.01"))

        ml = re.search(r"(\d+(?:\.\d+)?)\s*ML$", text)
        if ml:
            value = Decimal(ml.group(1)) / Decimal("1000")
            return (value * Decimal("5.30") + Decimal("1.40")).quantize(Decimal("0.01"))

        units = re.search(r"(\d+)\s*UN$", text)
        if units:
            value = Decimal(units.group(1))
            return (value * Decimal("1.40") + Decimal("3.20")).quantize(Decimal("0.01"))

        return Decimal("5.99")

    def _infer_stock(self, key):
        basis = sum(ord(char) for char in "|".join(key))
        return 18 + (basis % 60)

    def _infer_packages(self, product, departments):
        deps = {(dep or "").strip().title() for dep in departments or []}
        normalized_product = (product or "").strip().lower()

        if "papel higienico" in normalized_product:
            return [("UNIDADE", 1), ("FARDO", 8), ("PALETE", 64)]
        if "escova de dente" in normalized_product:
            return [("UNIDADE", 1), ("CAIXA", 12)]
        if "pasta de dente" in normalized_product or "creme dental" in normalized_product:
            return [("UNIDADE", 1), ("CAIXA", 12)]
        if "refrigerante" in normalized_product or "suco" in normalized_product or "agua" in normalized_product:
            return [("UNIDADE", 1), ("FARDO", 6), ("PALETE", 48)]
        if deps.intersection({"Higiene", "Higiene Pessoal", "Limpeza", "Laticinios", "Carnes"}):
            return [("UNIDADE", 1), ("CAIXA", 12), ("PALETE", 60)]
        return [("UNIDADE", 1), ("FARDO", 10), ("PALETE", 80)]

    def _normalize_variant(self, product, variant):
        product_text = (product or "").strip().lower()
        variant_text = (variant or "Tradicional").strip()
        normalized = variant_text.lower()

        if "arroz" in product_text:
            if "parbo" in normalized:
                return "Parboilizado"
            return "Branco"

        if "feijao" in product_text:
            if "fradinho" in normalized or "corda" in normalized:
                return "Feijao-de-corda"
            if "preto" in normalized:
                return "Preto"

        return variant_text

    def _build_catalog(self):
        merged = {}

        for item in self.BASE_CATALOG:
            merged[self._key(item)] = item

        for row in LOCAL_CATALOG_ITEMS:
            item = {
                "category": row.get("category") or "Mercearia",
                "product": row.get("product_name") or "Produto",
                "brand": row.get("brand") or "Sem Marca",
                "variant": self._normalize_variant(
                    row.get("product_name") or "Produto",
                    row.get("variant_label") or "Tradicional",
                ),
                "size": row.get("package_size") or "1UN",
                "departments": row.get("department_names") or ["Mercearia"],
            }
            key = self._key(item)
            if key in merged:
                continue
            item["price"] = self._infer_price(item["size"])
            item["stock_units"] = self._infer_stock(key)
            item["packages"] = self._infer_packages(item["product"], item["departments"])
            merged[key] = item

        for spec in self.FAMILY_SPECS:
            departments = spec["departments"]
            product = spec["product"]
            for brand in spec["brands"]:
                brand_variants = (spec.get("brand_variants") or {}).get(brand, spec["variants"])
                for variant in brand_variants:
                    for size in spec["sizes"]:
                        item = {
                            "category": resolve_category_name(
                                product_name=product,
                                department_names=departments,
                                requested_category=spec.get("category", ""),
                            ),
                            "product": product,
                            "brand": brand,
                            "variant": variant,
                            "size": size,
                            "departments": departments,
                        }
                        key = self._key(item)
                        if key in merged:
                            continue
                        item["price"] = self._infer_price(size)
                        item["stock_units"] = self._infer_stock(key)
                        item["packages"] = self._infer_packages(product, departments)
                        merged[key] = item
                        if len(merged) >= self.TARGET_VARIANTS:
                            return list(merged.values())

        return list(merged.values())

    def _merge_variant_records(self, source_variant, target_variant):
        target_variant.stock = max(target_variant.stock, source_variant.stock)
        target_variant.price = source_variant.price
        target_variant.is_active = target_variant.is_active or source_variant.is_active
        target_variant.save(update_fields=["stock", "price", "is_active", "updated_at"])

        for source_package in list(source_variant.packages.all()):
            target_package, pkg_created = ProductPackage.objects.get_or_create(
                variant=target_variant,
                name=source_package.name,
                defaults={
                    "units_per_package": source_package.units_per_package,
                    "is_default": source_package.is_default,
                    "is_active": source_package.is_active,
                },
            )
            source_variant.movements.filter(package=source_package).update(package=target_package)
            if not pkg_created:
                target_package.units_per_package = max(
                    target_package.units_per_package,
                    source_package.units_per_package,
                )
                target_package.is_active = target_package.is_active or source_package.is_active
                target_package.is_default = target_package.is_default or source_package.is_default
                target_package.save(
                    update_fields=["units_per_package", "is_active", "is_default", "updated_at"]
                )
            source_package.delete()

        source_variant.movements.update(variant=target_variant)
        source_variant.delete()

    def _merge_legacy_product_names(self, old_name, new_name):
        source_bases = list(ProductBase.objects.filter(name__iexact=old_name))
        for source_base in source_bases:
            target_base, _ = ProductBase.objects.get_or_create(
                category=source_base.category,
                name=new_name,
                brand=source_base.brand,
                defaults={"is_active": source_base.is_active},
            )
            if source_base.id == target_base.id:
                continue

            merged_departments = set(target_base.departments.values_list("id", flat=True))
            merged_departments.update(source_base.departments.values_list("id", flat=True))
            if merged_departments:
                target_base.departments.set(list(merged_departments))

            for source_variant in list(source_base.variants.all()):
                target_variant, created = ProductVariant.objects.get_or_create(
                    product=target_base,
                    variant_label=source_variant.variant_label,
                    package_size=source_variant.package_size,
                    defaults={
                        "price": source_variant.price,
                        "stock": source_variant.stock,
                        "is_active": source_variant.is_active,
                    },
                )
                if created:
                    source_variant.packages.update(variant=target_variant)
                    source_variant.movements.update(variant=target_variant)
                    source_variant.delete()
                    continue
                self._merge_variant_records(source_variant, target_variant)

            source_base.delete()

    def _cleanup_legacy_noise(self):
        removed = 0

        # Legacy synthetic product "Refri" should not remain as product base.
        refri_variants = ProductVariant.objects.filter(product__name__iregex=r"^refri(\b|\s)")
        removed += refri_variants.count()
        refri_variants.delete()

        # Legacy arroz variants not desired in current catalog strategy.
        arroz_legacy = ProductVariant.objects.filter(
            product__name__icontains="arroz",
            variant_label__iregex=r"(agulhinha|tipo\s*\d+|integral)",
        )
        removed += arroz_legacy.count()
        arroz_legacy.delete()

        arroz_out_of_standard = ProductVariant.objects.filter(
            product__name__icontains="arroz"
        ).exclude(
            Q(variant_label__iexact="Branco") | Q(variant_label__iexact="Parboilizado")
        )
        removed += arroz_out_of_standard.count()
        arroz_out_of_standard.delete()

        # Legacy feijao naming cleanup.
        feijao_legacy = ProductVariant.objects.filter(
            product__name__icontains="feijao",
            variant_label__iregex=r"fradinho",
        )
        removed += feijao_legacy.count()
        feijao_legacy.delete()

        # Remove impossible brand x flavor combinations in refrigerantes.
        for brand, invalid_flavors in self.INVALID_REFRI_BY_BRAND.items():
            for flavor in invalid_flavors:
                qs = ProductVariant.objects.filter(
                    product__name__icontains="refrigerante",
                    product__brand__icontains=brand,
                    variant_label__icontains=flavor,
                )
                removed += qs.count()
                qs.delete()

        # Remove obvious wrong beer brands coming from synthetic legacy data.
        bad_beer = ProductVariant.objects.filter(
            product__name__icontains="cerveja",
            product__brand__iregex=r"(coca|pepsi|guarana antarctica|del valle|minalba|crystal)",
        )
        removed += bad_beer.count()
        bad_beer.delete()

        # Consolidate old naming into canonical product names.
        for old_name, new_name in self.LEGACY_PRODUCT_RENAMES:
            self._merge_legacy_product_names(old_name, new_name)

        # Drop orphan product bases left by cleanup.
        ProductBase.objects.filter(variants__isnull=True).delete()
        return removed

    def handle(self, *args, **options):
        removed = self._cleanup_legacy_noise()
        catalog = self._build_catalog()

        created = 0
        for item in catalog:
            normalized_category = resolve_category_name(
                product_name=item["product"],
                department_names=item.get("departments", []),
                requested_category=item["category"],
            )
            category, _ = Category.objects.get_or_create(name=normalized_category)
            base, _ = ProductBase.objects.get_or_create(
                category=category,
                name=item["product"],
                brand=item["brand"],
            )
            departments = []
            for dep_name in item.get("departments", []):
                dep, _ = Department.objects.get_or_create(name=dep_name)
                departments.append(dep.id)
            if departments:
                base.departments.set(departments)

            variant, was_created = ProductVariant.objects.get_or_create(
                product=base,
                variant_label=item["variant"],
                package_size=item["size"],
                defaults={
                    "price": item["price"],
                    "stock": item["stock_units"],
                    "is_active": True,
                },
            )
            if not was_created:
                variant.price = item["price"]
                variant.save(update_fields=["price", "updated_at"])

            for idx, (name, units) in enumerate(item["packages"]):
                ProductPackage.objects.get_or_create(
                    variant=variant,
                    name=name,
                    defaults={
                        "units_per_package": units,
                        "is_default": idx == 0,
                        "is_active": True,
                    },
                )

            if not variant.movements.exists() and item["stock_units"] > 0:
                StockMovement.objects.create(
                    variant=variant,
                    movement_type=StockMovement.MOVEMENT_ADJUST,
                    units_delta=item["stock_units"],
                    package_quantity=1,
                    notes="Initial seed stock",
                )

            created += int(was_created)

        self.stdout.write(
            self.style.SUCCESS(
                f"Catalog seed finished. Variants available: {len(catalog)}. New variants created: {created}. Removed invalid legacy variants: {removed}."
            )
        )



