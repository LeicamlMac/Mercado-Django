from flask import Flask

app = Flask(__name__)

x = 1;

y = 2;


@app.route("/")
def home():
    return "Tchurusbango TchurusBagos"

@app.route("/rota")
def outra_rota():
    return "Oi voce pegou uma rota diferente e veio parar aqui"

if __name__ == "__main__":
    app.run(debug=True)