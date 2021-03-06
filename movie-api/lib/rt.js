import rp from 'request-promise-native'
import cheerio from 'cheerio'

const BASE_URL = 'https://www.rottentomatoes.com'

const transformTitle = title => title.replace(/[^a-z0-9+]+/gi, '_').toLowerCase()

const fetchHtml = title => new Promise((resolve, reject) => {
  title = transformTitle(title)
  rp(`${BASE_URL}/m/${title}`)
    .then(htmlResult => {
      resolve(extractData(htmlResult))
    })
    .catch(err => reject(err))
})

const extractRating = rating => {
  const { ratingValue, bestRating, worstRating, reviewCount, name, description } = rating
  return ({ ratingValue, bestRating, worstRating, reviewCount, name, description })
}

const extractPublisher = publisher => {
  const { name, url, image } = publisher
  return { name, url, image }
}

const extractReview = review => {
  const { url, reviewBody: body, dateCreated } = review
  let { author, reviewRating, publisher } = review
  author = extractPerson({ ...author, url: `${BASE_URL}${author.url}` })
  reviewRating = extractRating(reviewRating)
  publisher = extractPublisher({ ...publisher, url: `${BASE_URL}${publisher.url}` })
  return { url, body, dateCreated, author, reviewRating, publisher }
}

const extractPerson = person => {
  const { name, sameAs: url, image } = person
  return { name, url, image }
}

const extractData = htmlResult => {
  let $ = cheerio.load(htmlResult)

  const jsonLdData = $('#jsonLdSchema').html()
  const jsonData = JSON.parse(jsonLdData)

  const result = {
    title: jsonData.name,
    image: jsonData.image,
    contentRating: jsonData.contentRating,
    url: `${BASE_URL}${jsonData.url}`
  }

  if (jsonData.productionCompany && jsonData.productionCompany.hasOwnProperty('name')) {
    result.productionCompany = jsonData.productionCompany.name
  }

  if (jsonData.aggregateRating && typeof jsonData.aggregateRating === 'object') {
    result.aggregateRating = extractRating(jsonData.aggregateRating)
  }

  if (jsonData.review && Array.isArray(jsonData.review)) {
    result.review = jsonData.review.map(extractReview)
  }

  if (jsonData.character && Array.isArray(jsonData.character)) {
    result.character = jsonData.character
  }

  if (jsonData.actors && Array.isArray(jsonData.actors)) {
    result.actors = jsonData.actors.map(extractPerson).map((actor, index) => {
      if (result.character && result.character[index]) {
        return { ...actor, character: result.character[index] }
      }
      return actor
    })
  }

  if (jsonData.director && Array.isArray(jsonData.director)) {
    result.director = jsonData.director.map(extractPerson)
  }

  if (jsonData.author && Array.isArray(jsonData.author)) {
    result.author = jsonData.author.map(extractPerson)
  }

  if (jsonData.genre) {
    result.genre = jsonData.genre
  }

  result.releaseDate = $('.js-theater-release-dates>.meta-value>time').attr('datetime')

  const metaValues = $('li.meta-row.clearfix')
  metaValues.each((index, element) => {
    const innerText = $(element).text()

    if (innerText.indexOf('Runtime: ') >= 0) {
      result.runTime = innerText.trim().substr(9).trim()
    } else if (innerText.indexOf('Box Office: ') >= 0) {
      result.boxOffice = innerText.trim().substr(12).trim()
    } else if (innerText.indexOf('On Disc/Streaming: ') >= 0) {
      result.dvdStreaming = innerText.trim().substr(19).trim()
    }
  })

  return result
}

export default fetchHtml
