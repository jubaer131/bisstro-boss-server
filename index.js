const express = require('express')
const cors =require('cors')
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const formData = require('form-data');
const Mailgun = require('mailgun.js');
const mailgun = new Mailgun(formData);
const mg = mailgun.client({
  username: 'api',
  key: process.env.MAIL_GUN_API_KEY,
});


const port = process.env.PORT || 5000  
const app = express()


app.use(cors())
app.use(express.json())




const uri = 'mongodb+srv://bistro-boss:Rjc4II16hvRxBqzh@cluster0.8dssgfd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
console.log(uri)



// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const usercollection = client.db("bistoDb").collection("users");
    const Menucollection = client.db("bistoDb").collection("menu");
    const reviewscollection = client.db("bistoDb").collection("reviews");
    const cartcollection = client.db("bistoDb").collection("cart");
    const paymentcollection = client.db("bistoDb").collection("payment");


// jwt related api
app.post('/jwt', async (req, res) => {
  const user = req.body
  const token = jwt.sign(user,process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: '1h',})
  res.send({token})

})

// midleware for varify token 
const verifyToken = (req, res, next) => {
  console.log('inside verify token', req.headers.authorization);
  if (!req.headers.authorization) {
    return res.status(401).send({ message: 'unauthorized access' });
  }
  const token = req.headers.authorization.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: 'unauthorized access' })
    }
    req.decoded = decoded;
    next();
  })
}

// use verify admin after verifyToken
const verifyAdmin = async (req, res, next) => {
  const email = req.decoded.email;
  const query = { email: email };
  const user = await usercollection.findOne(query);
  const isAdmin = user?.role === 'admin';
  if (!isAdmin) {
    return res.status(403).send({ message: 'forbidden access' });
  }
  next();
}



// user related api 

  app.get('/users',verifyToken, verifyAdmin, async(req,res)=>{
    const result = await usercollection.find().toArray()
    res.send(result)
  })

  app.get('/users/admin/:email', verifyToken, async (req, res) => {
    const email = req.params.email;

    if (email !== req.decoded.email) {
      return res.status(403).send({ message: 'forbidden access' })
    }

    const query = { email: email };
    const user = await usercollection.findOne(query);
    let admin = false;
    if (user) {
      admin = user?.role === 'admin';
    }
    res.send({ admin });
  })


    app.patch('/users/admin/:id', verifyToken,verifyAdmin, async (req,res)=>{

      const id =req.params.id 
      const filter = {_id : new ObjectId (id)}
      const updatedDoc = {
        $set : {
           role : 'admin'
          }
      }
      const result = await usercollection.updateOne(filter,updatedDoc)
      res.send(result)
   })

   app.delete('users/:id', verifyToken,verifyAdmin, async(req,res)=>{
    const id = req.params.id 
    const query = { _id : new ObjectId (id)}
    const result = await usercollection.deleteOne(query)
    req.send(result)
  })



   app.post('/users', async (req, res) => {
    const user = req.body;
    // insert email if user doesnt exists: 
    // you can do this many ways (1. email unique, 2. upsert 3. simple checking)
    const query = { email: user.email }
    const existingUser = await usercollection.findOne(query);
    if (existingUser) {
      return res.send({ message: 'user already exists', insertedId: null })
    }
    const result = await usercollection.insertOne(user);
    res.send(result);
  });

  




// manu related api 

    app.get('/menu', async(req,res)=>{
    const result =await Menucollection.find().toArray()
    res.send(result)
    })

    app.get('/menu/:id', async (req,res)=>{
      const id = req.params.id 
      const query = { _id : new ObjectId (id)}
      const result = await Menucollection.findOne(query)
      res.send(result)
    })

    app.post('/menu',verifyToken,verifyAdmin, async(req,res)=>{
     const item = req.body 
     const result = await Menucollection.insertOne(item)
     res.send(result)
    })

    app.delete('/menu/:id', verifyToken,verifyAdmin, async (req,res)=>{
      const id = req.params.id 
      const query = { _id : new ObjectId(id)}
      const result = await Menucollection.deleteOne(query)
      res.send(result)
    })


    app.get('/reviews', async(req,res)=>{
    const result =await reviewscollection.find().toArray()
    res.send(result)
    })

// cart item 


  app.delete('/carts/:id', async (req,res)=>{

    const id = req.params.id 
    const query = { _id : new ObjectId (id)}
    const result = await cartcollection.deleteOne(query)
    res.send(result)
  })

   app.get('/carts', async (req,res)=>{
    const email = req.query.email
    const query = {email :email}
    const result = await cartcollection.find(query).toArray()
    res.send(result)
   })

    app.post('/carts', async(req,res)=>{
      const cartItem = req.body
      console.log(cartItem)
      const result = await cartcollection.insertOne(cartItem)
      res.send(result)
    })


    // payment intent
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price*100);
      console.log(amount)

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types : [ "card"],
        
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.get('/payments/:email', verifyToken, async (req, res) => {
      const query = { email: req.params.email }
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      const result = await paymentcollection.find(query).toArray();
      res.send(result);
    })

    app.post('/payments', async(req,res)=>{
      const payment = req.body
      const paymentresult = await paymentcollection.insertOne(payment)

      console.log('payment info', payment)
      const query = {
        _id: { $in: payment.cartId.map(id => new ObjectId(id)) }
    };

      // carefully delete each item from the cart
      const deletedresult = await cartcollection.deleteMany(query)

// send user email from here..


      res.send({paymentresult,deletedresult})
     
    })

    // stats or analytics
    app.get('/admin-stats', verifyToken, verifyAdmin, async (req, res) => {
      const users = await usercollection.estimatedDocumentCount();
      const menuItems = await Menucollection.estimatedDocumentCount();
      const orders = await paymentcollection.estimatedDocumentCount();

      // this is not the best way
      // const payments = await paymentCollection.find().toArray();
      // const revenue = payments.reduce((total, payment) => total + payment.price, 0);

      const result = await paymentcollection.aggregate([
        {
          $group: {
            _id: null,
            totalRevenue: {
              $sum: '$price'
            }
          }
        }
      ]).toArray();

      const revenue = result.length > 0 ? result[0].totalRevenue : 0;

      res.send({
        users,
        menuItems,
        orders,
        revenue
      })
    })

     // using aggregate pipeline
    //  app.get('/order-stats', async(req, res) =>{
    //   const result = await paymentcollection.aggregate([
    //     {
    //       $unwind: '$menuId'
    //     },
    //     {
    //       $lookup: {
    //         from: 'menu',
    //         localField: 'manuId',
    //         foreignField: '_id',
    //         as: 'menuItem'
    //       }
    //     },
    //     {
    //       $unwind: '$menuItem'
    //     },
    //     {
    //       $group: {
    //         _id: '$menuItem.category',
    //         quantity:{ $sum: 1 },
    //         revenue: { $sum: '$menuId.price'} 
    //       }
    //     },
    //     {
    //       $project: {
    //         _id: 0,
    //         category: '$_id',
    //         quantity: '$quantity',
    //         revenue: '$revenue'
    //       }
    //     }
    //   ]).toArray();

    //   res.send(result);

    // })



    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('bistro boss server')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})